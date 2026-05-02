import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Block } from '@/core/schema/blocks';
import type { CanvasConfig, SignatureSchema } from '@/core/schema/signature';
import { createEmptySchema } from '@/core/schema/signature';
import { useHistoryStore } from './historyStore';

/**
 * Schema store — the canonical source of truth for the signature
 * being edited (CLAUDE.md §13.1).
 *
 * Mutations go through immer so writes look mutational but
 * produce new state. Structural changes (add / delete / move /
 * duplicate) push a snapshot to {@link useHistoryStore} BEFORE
 * applying so undo lands on the pre-change state. Per-keystroke
 * field edits (e.g. text content typing) intentionally do NOT
 * push — that would flood the stack; the autosave debounce will
 * push periodically when persistence captures.
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

  /** Replace the entire schema (e.g. after loading from REST). */
  setSchema: (schema: SignatureSchema) => void;

  addBlock: (block: Block, position?: number) => void;
  insertBlockBefore: (target_id: string, block: Block) => void;
  insertBlockAfter: (target_id: string, block: Block) => void;
  updateBlock: (id: string, updates: Partial<Block>) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, target_id: string, position: 'before' | 'after') => void;
  duplicateBlock: (id: string) => void;

  /** Append a block to a Container's children list. */
  addChildToContainer: (parent_id: string, child: Block) => void;

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

function findIndexById(blocks: Block[], id: string): number {
  return blocks.findIndex((b) => b.id === id);
}

/**
 * Recursive lookup — walks into Container children so nested blocks
 * are reachable by id without callers needing to know the parent.
 */
export function findBlockByIdDeep(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.type === 'container' && block.children.length > 0) {
      const found = findBlockByIdDeep(block.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Recursive splice — returns true on first hit, mutates `blocks` in place.
 */
function removeBlockByIdDeep(blocks: Block[], id: string): boolean {
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx >= 0) {
    blocks.splice(idx, 1);
    return true;
  }
  for (const block of blocks) {
    if (block.type === 'container' && removeBlockByIdDeep(block.children, id)) {
      return true;
    }
  }
  return false;
}

/**
 * Locate the array a block lives in (top-level or a container's children)
 * along with its index. Used by sibling-swap actions so the Layers panel
 * can move nested blocks up / down within their own parent.
 */
function findParentAndIndex(
  blocks: Block[],
  id: string,
): { parent: Block[]; index: number } | null {
  const topIdx = blocks.findIndex((b) => b.id === id);
  if (topIdx >= 0) return { parent: blocks, index: topIdx };

  for (const block of blocks) {
    if (block.type === 'container') {
      const childIdx = block.children.findIndex((c) => c.id === id);
      if (childIdx >= 0) return { parent: block.children, index: childIdx };
    }
  }
  return null;
}

function pushSnapshot(): void {
  useHistoryStore.getState().push(useSchemaStore.getState().schema);
}

export const useSchemaStore = create<SchemaState>()(
  immer((set) => ({
    schema: createEmptySchema(),
    hasUserEdited: false,

    setSchema: (schema) => {
      set((state) => {
        state.schema = schema;
        // Loading is not editing — clear the flag so the autosave
        // doesn't immediately fire a POST/PATCH for the loaded data.
        state.hasUserEdited = false;
      });
      useHistoryStore.getState().clear();
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
        const index = findIndexById(state.schema.blocks, target_id);
        if (index === -1) {
          state.schema.blocks.push(block);
        } else {
          state.schema.blocks.splice(index, 0, block);
        }
        markEdited(state);
      });
    },

    insertBlockAfter: (target_id, block) => {
      pushSnapshot();
      set((state) => {
        const index = findIndexById(state.schema.blocks, target_id);
        if (index === -1) {
          state.schema.blocks.push(block);
        } else {
          state.schema.blocks.splice(index + 1, 0, block);
        }
        markEdited(state);
      });
    },

    updateBlock: (id, updates) => {
      // No snapshot for per-field edits — autosave captures periodically.
      // Recurses into Container children so nested blocks are
      // editable through the same selection-driven property panel.
      set((state) => {
        const block = findBlockByIdDeep(state.schema.blocks, id);
        if (block) {
          Object.assign(block, updates);
          markEdited(state);
        }
      });
    },

    deleteBlock: (id) => {
      pushSnapshot();
      set((state) => {
        removeBlockByIdDeep(state.schema.blocks, id);
        markEdited(state);
      });
    },

    addChildToContainer: (parent_id, child) => {
      pushSnapshot();
      set((state) => {
        const parent = findBlockByIdDeep(state.schema.blocks, parent_id);
        if (parent && parent.type === 'container') {
          parent.children.push(child);
          markEdited(state);
        }
      });
    },

    moveBlockUp: (id) => {
      pushSnapshot();
      set((state) => {
        const found = findParentAndIndex(state.schema.blocks, id);
        if (!found || found.index === 0) return;
        const { parent, index } = found;
        const above = parent[index - 1];
        const current = parent[index];
        if (above === undefined || current === undefined) return;
        parent[index - 1] = current;
        parent[index] = above;
        markEdited(state);
      });
    },

    moveBlockDown: (id) => {
      pushSnapshot();
      set((state) => {
        const found = findParentAndIndex(state.schema.blocks, id);
        if (!found) return;
        const { parent, index } = found;
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
      pushSnapshot();
      set((state) => {
        const blocks = state.schema.blocks;
        const fromIndex = findIndexById(blocks, id);
        if (fromIndex === -1) return;
        const [moving] = blocks.splice(fromIndex, 1);
        if (!moving) return;
        const targetIndex = findIndexById(blocks, target_id);
        if (targetIndex === -1) {
          blocks.push(moving);
        } else {
          blocks.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, moving);
        }
        markEdited(state);
      });
    },

    duplicateBlock: (id) => {
      pushSnapshot();
      set((state) => {
        const index = findIndexById(state.schema.blocks, id);
        if (index === -1) return;
        const original = state.schema.blocks[index];
        if (!original) return;
        const cloned = JSON.parse(JSON.stringify(original)) as Block;
        cloned.id = `${original.id}_copy_${Date.now().toString(36)}`;
        state.schema.blocks.splice(index + 1, 0, cloned);
        markEdited(state);
      });
    },

    updateCanvas: (updates) => {
      set((state) => {
        Object.assign(state.schema.canvas, updates);
        markEdited(state);
      });
    },

    setVariable: (key, value) => {
      set((state) => {
        state.schema.variables[key] = value;
        markEdited(state);
      });
    },

    removeVariable: (key) => {
      set((state) => {
        delete state.schema.variables[key];
        markEdited(state);
      });
    },

    renameVariable: (old_key, new_key) => {
      if (old_key === new_key || !new_key) return;
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
