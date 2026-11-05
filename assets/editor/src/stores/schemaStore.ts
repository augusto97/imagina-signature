import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Block, ContainerBlock } from '@/core/schema/blocks';
import type { CanvasConfig, SignatureSchema } from '@/core/schema/signature';
import { createEmptySchema } from '@/core/schema/signature';
import { migrateContainersInPlace } from '@/core/schema/migrate';
import { useHistoryStore } from './historyStore';
import {
  cloneBlockWithFreshIds,
  cloneSchema,
  containerCellArrays,
  findParentAndIndex,
} from './schemaUtils';

/**
 * Identifier for the cell side inside a 2-column container. The
 * Container schema stores left-cell children under `children` and
 * right-cell children under `right_children`; helper actions use
 * this string to pick the right array.
 */
export type ContainerCell = 'left' | 'right';

/**
 * Returns the children array for the given cell side. For 1-col
 * containers (or the "left" side of any container), this is just
 * `children`. For the right cell, returns the `right_children`
 * array, lazy-initialising it as an empty array if missing so
 * callers can splice into it directly.
 */
function cellChildren(container: ContainerBlock, cell: ContainerCell): Block[] {
  if (cell === 'left') return container.children;
  if (!Array.isArray(container.right_children)) {
    container.right_children = [];
  }
  return container.right_children;
}

/**
 * Idle gap (ms) after which the next property edit opens a new undo
 * step. Edits to the same field closer together than this collapse
 * into one step — typing a sentence or dragging a colour picker is a
 * single Ctrl+Z.
 */
export const HISTORY_COALESCE_MS = 500;

export interface ReplaceSchemaOptions {
  /**
   * `true` (default) pushes the current schema to history first so
   * Ctrl+Z restores it. `false` clears history instead.
   */
  undoable?: boolean;
}

/**
 * Schema store — the canonical source of truth for the signature
 * being edited (CLAUDE.md §13.1).
 *
 * Mutations go through immer so writes look mutational but
 * produce new state.
 *
 * History:
 *   - Structural changes (add / delete / move / duplicate / paste /
 *     template apply) push a snapshot to {@link useHistoryStore}
 *     BEFORE applying, so undo lands on the pre-change state.
 *   - Property edits (`updateBlock`, `updateCanvas`, `setVariable`)
 *     push a *coalesced* snapshot: only the first change of an "edit
 *     burst" pushes. A burst ends when the user pauses for
 *     {@link HISTORY_COALESCE_MS}, edits a different block / field,
 *     performs a structural change, or undoes / redoes.
 *   - No-op edits (same value written back) neither push history nor
 *     mark the document dirty.
 */
interface SchemaState {
  schema: SignatureSchema;

  /**
   * `true` once any user-initiated mutation has happened against the
   * schema (addBlock, updateBlock, deleteBlock, …). Cleared by
   * `setSchema()` because loading isn't editing. The autosave hook
   * gates on this — without it, opening the editor without doing
   * anything could trigger a POST that creates an empty signature
   * row in the listing. (User report 1.0.21: deleted everything,
   * created one signature, ended up with two empty rows.)
   */
  hasUserEdited: boolean;

  /**
   * Replace the entire schema after LOADING it (e.g. from REST).
   * Clears history and `hasUserEdited`. Do not use for user actions —
   * use {@link SchemaState.replaceSchema} instead.
   */
  setSchema: (schema: SignatureSchema) => void;

  /**
   * Replace the whole schema as a USER action (e.g. applying a
   * template). Marks the document edited so autosave persists it and,
   * with `{ undoable: true }` (the default), pushes the current schema
   * to history so a single Ctrl+Z brings it back. The input is cloned
   * and never mutated.
   */
  replaceSchema: (schema: SignatureSchema, options?: ReplaceSchemaOptions) => void;

  /**
   * Replace the schema during undo / redo replay.
   *
   * Differs from `setSchema()` in two ways:
   *   1. Does NOT clear the history stack — undo/redo move a cursor
   *      through past/future and the consumer needs the redo stack
   *      to survive. Until 1.0.24 the topbar's Undo handler was
   *      calling `setSchema` which clears history → undo became
   *      single-step (one Undo wiped the redo stack so Redo was
   *      permanently disabled).
   *   2. Does NOT clear `hasUserEdited` — undo IS a user edit
   *      (autosave should persist the result).
   * Also closes the current edit burst so the next property edit
   * starts a fresh undo step.
   */
  replaceSchemaForHistory: (schema: SignatureSchema) => void;

  /** Undo one step. Returns false when there is nothing to undo. */
  undo: () => boolean;

  /** Redo one step. Returns false when there is nothing to redo. */
  redo: () => boolean;

  addBlock: (block: Block, position?: number) => void;
  insertBlockBefore: (target_id: string, block: Block) => void;
  insertBlockAfter: (target_id: string, block: Block) => void;
  updateBlock: (id: string, updates: Partial<Block>) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, target_id: string, position: 'before' | 'after') => void;
  duplicateBlock: (id: string) => void;

  /**
   * Insert a copy of `block` (ids regenerated recursively) right after
   * `after_id`, or at the end of the top level when `after_id` is
   * null / not found. Returns the inserted copy's id.
   */
  pasteBlock: (block: Block, after_id: string | null) => string;

  /**
   * Append a block to a Container cell. The optional `cell` argument
   * defaults to `'left'` (back-compat with old call sites that
   * didn't know about cells). Use `'right'` to drop into the right
   * cell of a 2-column container.
   */
  addChildToContainer: (parent_id: string, child: Block, cell?: ContainerCell) => void;

  /**
   * Move an existing block into a specific container cell at a
   * specific position. Used by canvas drag-and-drop when the user
   * drops on an empty cell or between two siblings inside a cell.
   * The block is removed from its current parent and spliced into
   * the destination cell at `position` (defaults to end-of-cell).
   */
  moveBlockToContainerCell: (
    block_id: string,
    parent_id: string,
    cell: ContainerCell,
    position?: number,
  ) => void;

  /**
   * Toggle a Container between 1 and 2 columns. Going 1→2 leaves
   * everything in the left cell (so the user can drag pieces into
   * the new right cell). Going 2→1 merges right_children back into
   * children so no block is silently lost.
   */
  setContainerColumns: (container_id: string, columns: 1 | 2) => void;

  /** Swap a block with its previous sibling (within its current parent). */
  moveBlockUp: (id: string) => void;

  /** Swap a block with its next sibling (within its current parent). */
  moveBlockDown: (id: string) => void;

  updateCanvas: (updates: Partial<CanvasConfig>) => void;
  setVariable: (key: string, value: string) => void;
  removeVariable: (key: string) => void;
  renameVariable: (old_key: string, new_key: string) => void;
}

/**
 * Marks the schema as user-edited: bumps `meta.updated_at` AND flips
 * `hasUserEdited = true`. Every mutation action calls this so the
 * autosave hook can gate on the flag and never POST an empty
 * signature row that the user never actually touched.
 */
function markEdited(state: { schema: SignatureSchema; hasUserEdited: boolean }): void {
  state.schema.meta.updated_at = new Date().toISOString();
  state.hasUserEdited = true;
}

/**
 * Recursive lookup — walks into Container children so nested blocks
 * are reachable by id without callers needing to know the parent.
 * Walks BOTH the left cell (`children`) and the right cell
 * (`right_children`) so 2-column nested blocks are reachable too.
 */
export function findBlockByIdDeep(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.type === 'container') {
      for (const cell of containerCellArrays(block)) {
        const found = findBlockByIdDeep(cell, id);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/**
 * Recursive splice — returns true on first hit, mutates `blocks` in place.
 * Also walks both cells of every container.
 */
function removeBlockByIdDeep(blocks: Block[], id: string): boolean {
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx >= 0) {
    blocks.splice(idx, 1);
    return true;
  }
  for (const block of blocks) {
    if (block.type === 'container') {
      for (const cell of containerCellArrays(block)) {
        if (removeBlockByIdDeep(cell, id)) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// History plumbing
// ---------------------------------------------------------------------------

/**
 * The edit burst currently being coalesced into a single undo step.
 * `key` identifies the edited target + fields (e.g.
 * `block:b1:style.color`); `at` is the timestamp of the latest edit
 * in the burst. Module-level because it is transient UI bookkeeping,
 * not document state.
 */
let editBurst: { key: string; at: number } | null = null;

/** Close the current edit burst; the next property edit opens a new undo step. */
export function endHistoryBurst(): void {
  editBurst = null;
}

/** Snapshot for structural changes: always pushes, and ends any burst. */
function pushSnapshot(): void {
  editBurst = null;
  useHistoryStore.getState().push(useSchemaStore.getState().schema);
}

/**
 * Snapshot for property edits: pushes only when this edit starts a
 * new burst (different key, or idle ≥ {@link HISTORY_COALESCE_MS}).
 */
function pushCoalescedSnapshot(key: string): void {
  const now = Date.now();
  if (editBurst && editBurst.key === key && now - editBurst.at < HISTORY_COALESCE_MS) {
    editBurst.at = now;
    return;
  }
  useHistoryStore.getState().push(useSchemaStore.getState().schema);
  editBurst = { key, at: now };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Lists the fields `updates` would actually change on `current`, one
 * level deep into plain objects (`style.color`, `padding.top`) so
 * consecutive edits of two different style properties land in two
 * undo steps even though both arrive as a whole `style` object.
 */
function changedFields(current: object, updates: object): string[] {
  const before = current as Record<string, unknown>;
  const changed: string[] = [];
  for (const [key, next] of Object.entries(updates)) {
    const prev = before[key];
    if (isPlainObject(prev) && isPlainObject(next)) {
      const subKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      for (const sub of subKeys) {
        if (!sameValue(prev[sub], next[sub])) changed.push(`${key}.${sub}`);
      }
    } else if (!sameValue(prev, next)) {
      changed.push(key);
    }
  }
  return changed.sort();
}

export const useSchemaStore = create<SchemaState>()(
  immer((set, get) => ({
    schema: createEmptySchema(),
    hasUserEdited: false,

    setSchema: (schema) => {
      // Run the in-place container migration BEFORE the schema lands
      // in state. Older 2-col rows used a single `children` array
      // the compiler split in half; 1.0.31+ stores left vs right as
      // explicit arrays. The walker only mutates rows that need it
      // (idempotent), so re-loading a fresh signature is a no-op.
      migrateContainersInPlace(schema);
      set((state) => {
        state.schema = schema;
        // Loading is not editing — clear the flag so the autosave
        // doesn't immediately fire a POST/PATCH for the loaded data.
        state.hasUserEdited = false;
      });
      editBurst = null;
      useHistoryStore.getState().clear();
    },

    replaceSchema: (schema, options = {}) => {
      const undoable = options.undoable ?? true;
      // Clone so we never migrate / freeze an object the caller still
      // holds (e.g. the template row cached in the picker).
      const next = cloneSchema(schema);
      migrateContainersInPlace(next);
      if (undoable) {
        pushSnapshot();
      } else {
        editBurst = null;
        useHistoryStore.getState().clear();
      }
      set((state) => {
        state.schema = next;
        markEdited(state);
      });
    },

    replaceSchemaForHistory: (schema) => {
      // Used by undo / redo paths. Preserves both history stacks AND
      // hasUserEdited so the autosave still fires for the replayed
      // state. See comment on the interface declaration above.
      editBurst = null;
      migrateContainersInPlace(schema);
      set((state) => {
        state.schema = schema;
        state.hasUserEdited = true;
        state.schema.meta.updated_at = new Date().toISOString();
      });
    },

    undo: () => {
      const previous = useHistoryStore.getState().undo(get().schema);
      if (!previous) return false;
      get().replaceSchemaForHistory(previous);
      return true;
    },

    redo: () => {
      const next = useHistoryStore.getState().redo(get().schema);
      if (!next) return false;
      get().replaceSchemaForHistory(next);
      return true;
    },

    addBlock: (block, position) => {
      pushSnapshot();
      set((state) => {
        if (position === undefined) {
          state.schema.blocks.push(block);
        } else {
          state.schema.blocks.splice(position, 0, block);
        }
        markEdited(state);
      });
    },

    insertBlockBefore: (target_id, block) => {
      pushSnapshot();
      set((state) => {
        // Walk into Container children so dropping a library card
        // onto a nested block inserts at the right depth instead of
        // landing at the top level (which used to silently re-parent
        // the new block to root before 1.0.25).
        const found = findParentAndIndex(state.schema.blocks, target_id);
        if (!found) {
          state.schema.blocks.push(block);
        } else {
          found.parent.splice(found.index, 0, block);
        }
        markEdited(state);
      });
    },

    insertBlockAfter: (target_id, block) => {
      pushSnapshot();
      set((state) => {
        const found = findParentAndIndex(state.schema.blocks, target_id);
        if (!found) {
          state.schema.blocks.push(block);
        } else {
          found.parent.splice(found.index + 1, 0, block);
        }
        markEdited(state);
      });
    },

    updateBlock: (id, updates) => {
      // Recurses into Container children so nested blocks are
      // editable through the same selection-driven property panel.
      const current = findBlockByIdDeep(get().schema.blocks, id);
      if (!current) return;
      const fields = changedFields(current, updates);
      if (fields.length === 0) return; // no-op write — nothing to undo or save
      pushCoalescedSnapshot(`block:${id}:${fields.join('|')}`);
      set((state) => {
        const block = findBlockByIdDeep(state.schema.blocks, id);
        if (block) {
          Object.assign(block, updates);
          markEdited(state);
        }
      });
    },

    deleteBlock: (id) => {
      if (!findBlockByIdDeep(get().schema.blocks, id)) return;
      pushSnapshot();
      set((state) => {
        removeBlockByIdDeep(state.schema.blocks, id);
        markEdited(state);
      });
    },

    addChildToContainer: (parent_id, child, cell = 'left') => {
      const parent = findBlockByIdDeep(get().schema.blocks, parent_id);
      if (!parent || parent.type !== 'container') return;
      pushSnapshot();
      set((state) => {
        const target = findBlockByIdDeep(state.schema.blocks, parent_id);
        if (target && target.type === 'container') {
          // 1-col containers ignore `cell` — there's only one cell.
          // 2-col containers route to the requested cell.
          const list =
            target.columns === 2 ? cellChildren(target as ContainerBlock, cell) : target.children;
          list.push(child);
          markEdited(state);
        }
      });
    },

    moveBlockToContainerCell: (block_id, parent_id, cell, position) => {
      if (block_id === parent_id) return;
      const blocks = get().schema.blocks;
      const dest = findBlockByIdDeep(blocks, parent_id);
      if (!dest || dest.type !== 'container' || !findParentAndIndex(blocks, block_id)) return;
      pushSnapshot();
      set((state) => {
        // Resolve the destination FIRST so we know it's reachable
        // before pulling the block from its current parent.
        const parent = findBlockByIdDeep(state.schema.blocks, parent_id);
        if (!parent || parent.type !== 'container') return;

        const source = findParentAndIndex(state.schema.blocks, block_id);
        if (!source) return;

        const [moving] = source.parent.splice(source.index, 1);
        if (!moving) return;

        // Re-resolve the destination cell AFTER removal — the source
        // cell and the destination cell can be the same array, in
        // which case the index we computed earlier shifted by one.
        const target =
          parent.columns === 2
            ? cellChildren(parent as ContainerBlock, cell)
            : parent.children;

        const insertAt =
          typeof position === 'number'
            ? Math.max(0, Math.min(position, target.length))
            : target.length;

        target.splice(insertAt, 0, moving);
        markEdited(state);
      });
    },

    setContainerColumns: (container_id, columns) => {
      const existing = findBlockByIdDeep(get().schema.blocks, container_id);
      if (!existing || existing.type !== 'container' || existing.columns === columns) return;
      pushSnapshot();
      set((state) => {
        const container = findBlockByIdDeep(state.schema.blocks, container_id);
        if (!container || container.type !== 'container') return;
        const c = container as ContainerBlock;

        if (c.columns === columns) return;

        if (columns === 1) {
          // Going 2 → 1: merge right_children back into children so
          // no block is silently lost when the right cell goes away.
          if (Array.isArray(c.right_children) && c.right_children.length > 0) {
            c.children.push(...c.right_children);
          }
          c.right_children = [];
        } else {
          // Going 1 → 2: keep everything in the LEFT cell. The user
          // can drag pieces over to the new right cell from there.
          // We don't auto-split because the user just chose to add a
          // right column — they want to place things deliberately.
          if (!Array.isArray(c.right_children)) {
            c.right_children = [];
          }
        }

        c.columns = columns;
        markEdited(state);
      });
    },

    moveBlockUp: (id) => {
      const found = findParentAndIndex(get().schema.blocks, id);
      if (!found || found.index === 0) return;
      pushSnapshot();
      set((state) => {
        const loc = findParentAndIndex(state.schema.blocks, id);
        if (!loc || loc.index === 0) return;
        const { parent, index } = loc;
        const above = parent[index - 1];
        const current = parent[index];
        if (above === undefined || current === undefined) return;
        parent[index - 1] = current;
        parent[index] = above;
        markEdited(state);
      });
    },

    moveBlockDown: (id) => {
      const found = findParentAndIndex(get().schema.blocks, id);
      if (!found || found.index >= found.parent.length - 1) return;
      pushSnapshot();
      set((state) => {
        const loc = findParentAndIndex(state.schema.blocks, id);
        if (!loc) return;
        const { parent, index } = loc;
        if (index >= parent.length - 1) return;
        const below = parent[index + 1];
        const current = parent[index];
        if (below === undefined || current === undefined) return;
        parent[index + 1] = current;
        parent[index] = below;
        markEdited(state);
      });
    },

    moveBlock: (id, target_id, position) => {
      if (id === target_id) return;
      const blocks = get().schema.blocks;
      if (!findParentAndIndex(blocks, id) || !findParentAndIndex(blocks, target_id)) return;
      pushSnapshot();
      set((state) => {
        // Walk into Container children for BOTH the source and target
        // — until 1.0.25 this only operated on `state.schema.blocks`,
        // so dragging a nested block produced one of:
        //   - silent no-op (source not found at top level)
        //   - schema corruption (`splice(-1, 1)` removed the LAST
        //     top-level block when the source resolved to index -1)
        const source = findParentAndIndex(state.schema.blocks, id);
        if (!source) return;
        const [moving] = source.parent.splice(source.index, 1);
        if (!moving) return;

        // Resolve target AFTER removal so target indices in the same
        // parent array stay correct.
        const target = findParentAndIndex(state.schema.blocks, target_id);
        if (!target) {
          // Target gone — re-insert the moving block where it was
          // rather than corrupting any other location.
          source.parent.splice(source.index, 0, moving);
          return;
        }

        target.parent.splice(
          position === 'before' ? target.index : target.index + 1,
          0,
          moving,
        );
        markEdited(state);
      });
    },

    duplicateBlock: (id) => {
      const found = findParentAndIndex(get().schema.blocks, id);
      const original = found ? found.parent[found.index] : undefined;
      if (!original) return;
      // Recursively re-id the clone AND every nested block in both
      // container cells — a copy sharing ids with the original makes
      // edits to the copy land on the original (and breaks React keys
      // / dnd-kit). Built outside the producer so the clone is a plain
      // object, not a draft.
      const cloned = cloneBlockWithFreshIds(original);
      pushSnapshot();
      set((state) => {
        // Walk into Container children so duplicating a nested block
        // inserts the copy next to the original instead of silently
        // no-opping (which is what the flat lookup did before 1.0.25).
        const loc = findParentAndIndex(state.schema.blocks, id);
        if (!loc) return;
        loc.parent.splice(loc.index + 1, 0, cloned);
        markEdited(state);
      });
    },

    pasteBlock: (block, after_id) => {
      const copy = cloneBlockWithFreshIds(block);
      pushSnapshot();
      set((state) => {
        const loc = after_id ? findParentAndIndex(state.schema.blocks, after_id) : null;
        if (loc) {
          loc.parent.splice(loc.index + 1, 0, copy);
        } else {
          state.schema.blocks.push(copy);
        }
        markEdited(state);
      });
      return copy.id;
    },

    updateCanvas: (updates) => {
      const fields = changedFields(get().schema.canvas, updates);
      if (fields.length === 0) return;
      pushCoalescedSnapshot(`canvas:${fields.join('|')}`);
      set((state) => {
        Object.assign(state.schema.canvas, updates);
        markEdited(state);
      });
    },

    setVariable: (key, value) => {
      const variables = get().schema.variables;
      if (Object.prototype.hasOwnProperty.call(variables, key) && variables[key] === value) return;
      pushCoalescedSnapshot(`var:${key}`);
      set((state) => {
        state.schema.variables[key] = value;
        markEdited(state);
      });
    },

    removeVariable: (key) => {
      if (!Object.prototype.hasOwnProperty.call(get().schema.variables, key)) return;
      pushSnapshot();
      set((state) => {
        delete state.schema.variables[key];
        markEdited(state);
      });
    },

    renameVariable: (old_key, new_key) => {
      if (old_key === new_key || !new_key) return;
      if (!Object.prototype.hasOwnProperty.call(get().schema.variables, old_key)) return;
      pushSnapshot();
      set((state) => {
        if (!(old_key in state.schema.variables)) return;
        const value = state.schema.variables[old_key];
        delete state.schema.variables[old_key];
        if (value !== undefined) {
          state.schema.variables[new_key] = value;
        }
        markEdited(state);
      });
    },
  })),
);
