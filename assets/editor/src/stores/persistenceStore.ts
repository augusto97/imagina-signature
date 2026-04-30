import { create } from 'zustand';

/**
 * Tracks the autosave / persistence state surfaced in the topbar.
 */
interface PersistenceState {
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  lastError: string | null;

  markDirty: () => void;
  markSaving: () => void;
  markSaved: () => void;
  setError: (message: string | null) => void;
}

export const usePersistenceStore = create<PersistenceState>((set) => ({
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  lastError: null,

  markDirty: () => set({ isDirty: true, lastError: null }),
  markSaving: () => set({ isSaving: true }),
  markSaved: () =>
    set({
      isDirty: false,
      isSaving: false,
      lastSavedAt: new Date().toISOString(),
      lastError: null,
    }),
  setError: (message) => set({ lastError: message, isSaving: false }),
}));
