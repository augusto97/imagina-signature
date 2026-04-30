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

  /** Replace the entire schema (e.g. after loading from REST). */
  setSchema: (schema: SignatureSchema) => void;

  addBlock: (block: Block, position?: number) => void;
  insertBlockBefore: (target_id: string, block: Block) => void;
  insertBlockAfter: (target_id: string, block: Block) => void;
  updateBlock: (id: string, updates: Partial<Block>) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, target_id: string, position: 'before' | 'after') => void;
  duplicateBlock: (id: string) => void;

  updateCanvas: (updates: Partial<CanvasConfig>) => void;
  setVariable: (key: string, value: string) => void;
}

function bumpUpdatedAt(schema: SignatureSchema): void {
  schema.meta.updated_at = new Date().toISOString();
}

function findIndexById(blocks: Block[], id: string): number {
  return blocks.findIndex((b) => b.id === id);
}

function pushSnapshot(): void {
  useHistoryStore.getState().push(useSchemaStore.getState().schema);
}

export const useSchemaStore = create<SchemaState>()(
  immer((set) => ({
    schema: createEmptySchema(),

    setSchema: (schema) => {
      set((state) => {
        state.schema = schema;
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
        bumpUpdatedAt(state.schema);
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
        bumpUpdatedAt(state.schema);
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
        bumpUpdatedAt(state.schema);
      });
    },

    updateBlock: (id, updates) => {
      // No snapshot for per-field edits — autosave captures periodically.
      set((state) => {
        const block = state.schema.blocks.find((b) => b.id === id);
        if (block) {
          Object.assign(block, updates);
          bumpUpdatedAt(state.schema);
        }
      });
    },

    deleteBlock: (id) => {
      pushSnapshot();
      set((state) => {
        state.schema.blocks = state.schema.blocks.filter((b) => b.id !== id);
        bumpUpdatedAt(state.schema);
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
        bumpUpdatedAt(state.schema);
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
        bumpUpdatedAt(state.schema);
      });
    },

    updateCanvas: (updates) => {
      set((state) => {
        Object.assign(state.schema.canvas, updates);
        bumpUpdatedAt(state.schema);
      });
    },

    setVariable: (key, value) => {
      set((state) => {
        state.schema.variables[key] = value;
        bumpUpdatedAt(state.schema);
      });
    },
  })),
);
