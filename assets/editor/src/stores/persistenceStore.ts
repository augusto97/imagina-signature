import { create } from 'zustand';

/**
 * Tracks the autosave / persistence state surfaced in the topbar.
 */
interface PersistenceState {
  /**
   * Whether the editor has finished bootstrapping (either no signature
   * to load, or fetched + setSchema'd successfully). Autosave gates on
   * this so the load itself doesn't trigger a redundant PATCH.
   */
  isLoaded: boolean;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  lastError: string | null;

  markLoaded: () => void;
  markDirty: () => void;
  markSaving: () => void;
  markSaved: () => void;
  setError: (message: string | null) => void;
}

export const usePersistenceStore = create<PersistenceState>((set) => ({
  isLoaded: false,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  lastError: null,

  markLoaded: () => set({ isLoaded: true }),
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
