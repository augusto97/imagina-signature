import { create } from 'zustand';

/**
 * Tracks which block is currently selected and which is hovered.
 *
 * Both are independent: the user can hover one block while another
 * stays selected. Selection drives the right-sidebar property panel;
 * hover drives the visual outline overlay.
 */
interface SelectionState {
  selectedBlockId: string | null;
  hoveredBlockId: string | null;

  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedBlockId: null,
  hoveredBlockId: null,

  select: (id) => set({ selectedBlockId: id }),
  hover: (id) => set({ hoveredBlockId: id }),
  clearSelection: () => set({ selectedBlockId: null, hoveredBlockId: null }),
}));
