import { create } from 'zustand';

export type SignatureStatus = 'draft' | 'ready' | 'archived';

/**
 * Tracks signature-row metadata (id, name, status) + the autosave /
 * persistence state surfaced in the topbar.
 *
 * The id, name, and status live alongside the schema but aren't part
 * of `json_content` — they're columns on the signature row. The
 * editor needs a Topbar input for the user-facing ones (name +
 * status), so we track them here in a single tiny store, rather than
 * sprinkling another `entityStore.ts`.
 *
 * Mutations to `signatureName` / `signatureStatus` don't go through
 * the schema's `hasUserEdited` flag — instead they call
 * `persistence.scheduleSave()` directly. The save engine reads name
 * + status from this store at PATCH/POST time.
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

  /**
   * Display name of the signature. Defaults to "Untitled" for new
   * rows; populated from the loaded row by `useLoadSignature`.
   * Editing this field via the Topbar input calls
   * `persistence.scheduleSave()` so it autosaves.
   */
  signatureName: string;
  /** Status — controls how the row is grouped in the listing. */
  signatureStatus: SignatureStatus;

  markLoaded: () => void;
  markDirty: () => void;
  markSaving: () => void;
  markSaved: () => void;
  /**
   * Drain the saving / dirty UI state without flipping `lastSavedAt`.
   * Used when the persistence engine's loop ran without producing a
   * network call (e.g. the empty-blocks guard refused to POST a fresh
   * signature with no content). Calling `markSaved()` in that case
   * would put the misleading "Saved · HH:MM" timestamp in the topbar
   * even though nothing landed on the server — that's how the
   * headline 1.0.23 "saves silently fail" bug surfaced.
   */
  markDrainedNoOp: () => void;
  setError: (message: string | null) => void;

  /**
   * Sets the row's display name + flips the persistence engine's
   * dirty bit so the autosave picks it up. Called by the Topbar
   * Name input.
   */
  setSignatureName: (name: string) => void;
  /** Same idea for the Status dropdown. */
  setSignatureStatus: (status: SignatureStatus) => void;
  /** Bulk set used by `useLoadSignature` after fetching the row. */
  hydrateRowMeta: (meta: { name: string; status: SignatureStatus }) => void;
}

export const usePersistenceStore = create<PersistenceState>((set) => ({
  isLoaded: false,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  lastError: null,
  signatureName: 'Untitled',
  signatureStatus: 'draft',

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
  markDrainedNoOp: () =>
    set({
      isDirty: false,
      isSaving: false,
      lastError: null,
    }),
  setError: (message) => set({ lastError: message, isSaving: false }),

  setSignatureName: (signatureName) => set({ signatureName }),
  setSignatureStatus: (signatureStatus) => set({ signatureStatus }),
  hydrateRowMeta: ({ name, status }) =>
    set({ signatureName: name, signatureStatus: status }),
}));
