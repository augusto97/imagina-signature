import { create } from 'zustand';

export type DropIndicatorPosition = 'before' | 'after';

/**
 * Where the block being dragged on the canvas would land right now.
 * Written by the drag handlers on every pointer move, read by each
 * SortableBlock through a per-block selector so only the target block
 * (and the previous one) re-render.
 */
interface DropIndicatorState {
  targetId: string | null;
  position: DropIndicatorPosition | null;
  show: (targetId: string, position: DropIndicatorPosition) => void;
  clear: () => void;
}

export const useDropIndicatorStore = create<DropIndicatorState>((set, get) => ({
  targetId: null,
  position: null,
  show: (targetId, position) => {
    const current = get();
    if (current.targetId === targetId && current.position === position) return;
    set({ targetId, position });
  },
  clear: () => {
    if (get().targetId === null) return;
    set({ targetId: null, position: null });
  },
}));
