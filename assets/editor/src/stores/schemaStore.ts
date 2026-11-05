import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Block, ContainerBlock, ContainerColumn } from '@/core/schema/blocks';
import type { CanvasConfig, SignatureSchema } from '@/core/schema/signature';
import { createEmptySchema } from '@/core/schema/signature';
import { migrateBlock, migrateSchemaInPlace } from '@/core/schema/migrate';
import {
  canPlaceAtDepth,
  findBlock,
  findColumn,
  isContainer,
  isDescendantOf,
  locateBlock,
} from '@/core/schema/tree';
import {
  clampColumnCount,
  normalizeWidths,
  removeColumnInPlace,
  sameWidths,
  setColumnCountInPlace,
} from '@/core/schema/columns';
import { useHistoryStore } from './historyStore';
import { cloneBlockWithFreshIds, cloneSchema, findParentAndIndex } from './schemaUtils';

/** Column fields editable through {@link SchemaState.updateContainerColumn}. */
export type ContainerColumnUpdates = Partial<Pick<ContainerColumn, 'valign' | 'box'>>;

/**
 * Idle gap (ms) after which the next property edit opens a new undo
 * step. Edits to the same field closer together than this collapse
 * into one step — typing a sentence or dragging a colour picker is a
 * single Ctrl+Z.
 */
export const HISTORY_COALESCE_MS = 500;

export interface UpdateBlockOptions {
  /** `false` = derived write: applied and saved, but no undo step. Default `true`. */
  history?: boolean;
}

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

  /**
   * Insertion / move actions return `false` (and change nothing) when
   * the target is missing or the result would nest containers deeper
   * than `MAX_CONTAINER_NESTING` (a container inside a column of a
   * top-level container is fine; one level further is not).
   */
  addBlock: (block: Block, position?: number) => boolean;
  insertBlockBefore: (target_id: string, block: Block) => boolean;
  insertBlockAfter: (target_id: string, block: Block) => boolean;
  /**
   * Merge `updates` into block `id`. Pass `{ history: false }` for
   * DERIVED writes the user didn't make directly — e.g. the URL of a
   * QR/vCard/avatar file that was just uploaded for content the user
   * already changed. Those must not become their own undo step:
   * undoing one would bring back stale content, trigger a re-upload
   * and wipe the redo stack.
   */
  updateBlock: (id: string, updates: Partial<Block>, options?: UpdateBlockOptions) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, target_id: string, position: 'before' | 'after') => boolean;
  duplicateBlock: (id: string) => void;

  /**
   * Insert a copy of `block` (migrated to the current schema, ids
   * regenerated recursively — columns included) right after
   * `after_id`, or at the end of the top level when `after_id` is
   * null / not found. Returns the inserted copy's id, or `null` when
   * the paste was rejected because it would nest containers too deep.
   */
  pasteBlock: (block: Block, after_id: string | null) => string | null;

  /**
   * Insert a block into column `columnId` of container `containerId`
   * at `position` (default: end of the column).
   */
  addChildToColumn: (
    containerId: string,
    columnId: string,
    block: Block,
    position?: number,
  ) => boolean;

  /**
   * Move an existing block (from anywhere in the tree) into column
   * `columnId` of container `containerId` at `position` (default: end
   * of the column). Used by drag-and-drop on a column drop zone and
   * by the Layers panel.
   */
  moveBlockToColumn: (
    blockId: string,
    containerId: string,
    columnId: string,
    position?: number,
  ) => boolean;

  /**
   * Set the number of columns (clamped 1..4) with an even split.
   * Removed columns hand their children to the previous column, in
   * order — no block is ever lost. Added columns are empty.
   */
  setContainerColumns: (containerId: string, count: number) => void;

  /**
   * Apply a layout preset: as many columns as `widths` entries (same
   * child-preserving rules as {@link setContainerColumns}) with those
   * widths (normalised to sum 100).
   */
  setContainerLayout: (containerId: string, widths: number[]) => void;

  /**
   * Set every column's width at once (normalised to sum 100; length
   * must match the column count). Coalesced into one undo step while
   * the user drags / types.
   */
  setColumnWidths: (containerId: string, widths: number[]) => void;

  /**
   * Remove one column; its children move to the end of the previous
   * column (or the start of the next one for the first column), which
   * also absorbs its width. A container keeps at least one column.
   */
  removeContainerColumn: (containerId: string, columnId: string) => void;

  /** Swap a column with its left (`-1`) or right (`1`) neighbour. */
  moveContainerColumn: (containerId: string, columnId: string, direction: -1 | 1) => void;

  /** Edit a column's vertical alignment / box (coalesced history). */
  updateContainerColumn: (
    containerId: string,
    columnId: string,
    updates: ContainerColumnUpdates,
  ) => void;

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
 * Recursive lookup — walks every container column at any depth, so
 * nested blocks are reachable by id without callers needing to know
 * the parent. Alias of `findBlock()` from `core/schema/tree`.
 */
export function findBlockByIdDeep(blocks: Block[], id: string): Block | undefined {
  return findBlock(blocks, id);
}

/** Recursive splice — returns true on first hit, mutates the tree in place. */
function removeBlockByIdDeep(blocks: Block[], id: string): boolean {
  const loc = locateBlock(blocks, id);
  if (!loc) return false;
  loc.list.splice(loc.index, 1);
  return true;
}

/** Container `id` (any depth) or undefined. */
function findContainer(blocks: Block[], id: string): ContainerBlock | undefined {
  const block = findBlock(blocks, id);
  return isContainer(block) ? block : undefined;
}

/**
 * Whether `block` may land in the list that holds `targetId` (i.e.
 * before / after it). Unknown targets resolve to the top level.
 */
function canPlaceNextTo(blocks: Block[], targetId: string, block: Block): boolean {
  const loc = locateBlock(blocks, targetId);
  return canPlaceAtDepth(block, loc ? loc.depth : 0);
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
      // Run the in-place migration BEFORE the schema lands in state:
      // 1.0 containers (`children` / `right_children`, and the
      // pre-1.0.31 single list) become 1.1 `columns`, and the version
      // is stamped 1.1. Idempotent, so re-loading a current signature
      // is a no-op.
      migrateSchemaInPlace(schema);
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
      migrateSchemaInPlace(next);
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
      migrateSchemaInPlace(schema);
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
      if (!canPlaceAtDepth(block, 0)) return false;
      pushSnapshot();
      set((state) => {
        if (position === undefined) {
          state.schema.blocks.push(block);
        } else {
          state.schema.blocks.splice(position, 0, block);
        }
        markEdited(state);
      });
      return true;
    },

    insertBlockBefore: (target_id, block) => {
      if (!canPlaceNextTo(get().schema.blocks, target_id, block)) return false;
      pushSnapshot();
      set((state) => {
        // Walk into container columns so dropping a library card
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
      return true;
    },

    insertBlockAfter: (target_id, block) => {
      if (!canPlaceNextTo(get().schema.blocks, target_id, block)) return false;
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
      return true;
    },

    updateBlock: (id, updates, options = {}) => {
      // Recurses into Container children so nested blocks are
      // editable through the same selection-driven property panel.
      const current = findBlockByIdDeep(get().schema.blocks, id);
      if (!current) return;
      const fields = changedFields(current, updates);
      if (fields.length === 0) return; // no-op write — nothing to undo or save
      if (options.history !== false) {
        pushCoalescedSnapshot(`block:${id}:${fields.join('|')}`);
      }
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

    addChildToColumn: (containerId, columnId, block, position) => {
      const dest = findColumn(get().schema.blocks, containerId, columnId);
      if (!dest || !canPlaceAtDepth(block, dest.depth)) return false;
      pushSnapshot();
      set((state) => {
        const target = findColumn(state.schema.blocks, containerId, columnId);
        if (!target) return;
        const list = target.column.children;
        const insertAt =
          typeof position === 'number' ? Math.max(0, Math.min(position, list.length)) : list.length;
        list.splice(insertAt, 0, block);
        markEdited(state);
      });
      return true;
    },

    moveBlockToColumn: (blockId, containerId, columnId, position) => {
      if (blockId === containerId) return false;
      const blocks = get().schema.blocks;
      const moving = findBlock(blocks, blockId);
      const dest = findColumn(blocks, containerId, columnId);
      if (!moving || !dest) return false;
      // A container can't move into one of its own columns, nor nest
      // deeper than MAX_CONTAINER_NESTING.
      if (isDescendantOf(blocks, blockId, containerId)) return false;
      if (!canPlaceAtDepth(moving, dest.depth)) return false;
      pushSnapshot();
      set((state) => {
        const source = locateBlock(state.schema.blocks, blockId);
        if (!source) return;
        const [block] = source.list.splice(source.index, 1);
        if (!block) return;

        // Re-resolve the destination AFTER removal — source and
        // destination can be the same column, whose indices just
        // shifted by one.
        const target = findColumn(state.schema.blocks, containerId, columnId);
        if (!target) {
          source.list.splice(source.index, 0, block);
          return;
        }
        const list = target.column.children;
        const insertAt =
          typeof position === 'number' ? Math.max(0, Math.min(position, list.length)) : list.length;
        list.splice(insertAt, 0, block);
        markEdited(state);
      });
      return true;
    },

    setContainerColumns: (containerId, count) => {
      const existing = findContainer(get().schema.blocks, containerId);
      const target = clampColumnCount(count);
      if (!existing || existing.columns.length === target) return;
      pushSnapshot();
      set((state) => {
        const container = findContainer(state.schema.blocks, containerId);
        if (!container) return;
        setColumnCountInPlace(container, target);
        markEdited(state);
      });
    },

    setContainerLayout: (containerId, widths) => {
      const existing = findContainer(get().schema.blocks, containerId);
      if (!existing || widths.length === 0) return;
      const count = clampColumnCount(widths.length);
      const normalized = normalizeWidths(widths.slice(0, count));
      const current = existing.columns.map((c) => c.width);
      if (existing.columns.length === count && sameWidths(current, normalized)) return;
      pushSnapshot();
      set((state) => {
        const container = findContainer(state.schema.blocks, containerId);
        if (!container) return;
        setColumnCountInPlace(container, count, normalized);
        markEdited(state);
      });
    },

    setColumnWidths: (containerId, widths) => {
      const existing = findContainer(get().schema.blocks, containerId);
      if (!existing || widths.length !== existing.columns.length) return;
      const normalized = normalizeWidths(widths);
      if (existing.columns.every((c, i) => c.width === normalized[i])) return;
      pushCoalescedSnapshot(`columns:${containerId}:width`);
      set((state) => {
        const container = findContainer(state.schema.blocks, containerId);
        if (!container) return;
        container.columns.forEach((column, i) => {
          column.width = normalized[i] ?? column.width;
        });
        markEdited(state);
      });
    },

    removeContainerColumn: (containerId, columnId) => {
      const existing = findContainer(get().schema.blocks, containerId);
      if (!existing || existing.columns.length <= 1) return;
      if (!existing.columns.some((c) => c.id === columnId)) return;
      pushSnapshot();
      set((state) => {
        const container = findContainer(state.schema.blocks, containerId);
        if (!container) return;
        removeColumnInPlace(
          container,
          container.columns.findIndex((c) => c.id === columnId),
        );
        markEdited(state);
      });
    },

    moveContainerColumn: (containerId, columnId, direction) => {
      const existing = findContainer(get().schema.blocks, containerId);
      if (!existing) return;
      const from = existing.columns.findIndex((c) => c.id === columnId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= existing.columns.length) return;
      pushSnapshot();
      set((state) => {
        const container = findContainer(state.schema.blocks, containerId);
        if (!container) return;
        const [column] = container.columns.splice(from, 1);
        if (!column) return;
        container.columns.splice(to, 0, column);
        markEdited(state);
      });
    },

    updateContainerColumn: (containerId, columnId, updates) => {
      const found = findColumn(get().schema.blocks, containerId, columnId);
      if (!found) return;
      const fields = changedFields(found.column, updates);
      if (fields.length === 0) return;
      pushCoalescedSnapshot(`column:${columnId}:${fields.join('|')}`);
      set((state) => {
        const target = findColumn(state.schema.blocks, containerId, columnId);
        if (!target) return;
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined) {
            delete (target.column as unknown as Record<string, unknown>)[key];
          } else {
            (target.column as unknown as Record<string, unknown>)[key] = value;
          }
        }
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
      if (id === target_id) return false;
      const blocks = get().schema.blocks;
      const moving = findBlock(blocks, id);
      const targetLoc = locateBlock(blocks, target_id);
      if (!moving || !targetLoc) return false;
      // Never into its own subtree, never deeper than allowed.
      if (isDescendantOf(blocks, id, target_id)) return false;
      if (!canPlaceAtDepth(moving, targetLoc.depth)) return false;
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
      return true;
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
      // The clipboard may hold a block copied before an upgrade (1.0
      // container shape) — migrate it, then re-id everything.
      const copy = cloneBlockWithFreshIds(migrateBlock(block));
      const anchor = after_id ? locateBlock(get().schema.blocks, after_id) : null;
      if (!canPlaceAtDepth(copy, anchor ? anchor.depth : 0)) return null;
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
