import { create } from 'zustand';

/**
 * UI-only editor state — sidebar visibility, active tab, modal flags.
 * Decoupled from the schema so opening / closing a panel never marks
 * the document dirty.
 */
type LeftSidebarTab = 'blocks' | 'layers' | 'templates';
type Modal = 'preview' | 'export' | 'template-picker' | null;

interface EditorState {
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  leftSidebarTab: LeftSidebarTab;
  modal: Modal;

  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setLeftSidebarTab: (tab: LeftSidebarTab) => void;
  openModal: (modal: Modal) => void;
  closeModal: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  leftSidebarTab: 'blocks',
  modal: null,

  toggleLeftSidebar: () => set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),
  toggleRightSidebar: () => set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),
  setLeftSidebarTab: (tab) => set({ leftSidebarTab: tab }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
}));
