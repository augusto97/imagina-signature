import { create } from 'zustand';
import type { SignatureSchema } from '@/core/schema/signature';

/**
 * Undo / redo stack for the schema (CLAUDE.md §13.2).
 *
 * History stores immutable schema snapshots; the schema store
 * pushes a snapshot before structural mutations (add/delete/move)
 * and consumes the latest one on undo. Capped at 50 entries to
 * keep memory bounded — older entries fall off the back of `past`.
 */
const MAX_DEPTH = 50;

interface HistoryState {
  past: SignatureSchema[];
  future: SignatureSchema[];

  push: (snapshot: SignatureSchema) => void;
  undo: (current: SignatureSchema) => SignatureSchema | null;
  redo: (current: SignatureSchema) => SignatureSchema | null;
  clear: () => void;

  canUndo: () => boolean;
  canRedo: () => boolean;
}

function clone(schema: SignatureSchema): SignatureSchema {
  return typeof structuredClone === 'function'
    ? structuredClone(schema)
    : (JSON.parse(JSON.stringify(schema)) as SignatureSchema);
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],

  push: (snapshot) =>
    set((state) => ({
      past: [...state.past.slice(-(MAX_DEPTH - 1)), clone(snapshot)],
      future: [], // any new edit invalidates the redo stack
    })),

  undo: (current) => {
    const { past } = get();
    if (past.length === 0) return null;
    const previous = past[past.length - 1] ?? null;
    if (!previous) return null;
    set({
      past: past.slice(0, -1),
      future: [clone(current), ...get().future],
    });
    return previous;
  },

  redo: (current) => {
    const { future } = get();
    if (future.length === 0) return null;
    const next = future[0] ?? null;
    if (!next) return null;
    set({
      past: [...get().past, clone(current)],
      future: future.slice(1),
    });
    return next;
  },

  clear: () => set({ past: [], future: [] }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));
