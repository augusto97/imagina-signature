import { create } from 'zustand';

export type SignatureStatus = 'draft' | 'ready' | 'archived';

/**
 * Tracks signature-row metadata (id, name, status) + the explicit
 * Save state surfaced in the topbar.
 *
 * The id, name, and status live alongside the schema but aren't part
 * of `json_content` — they're columns on the signature row. The
 * editor needs Topbar inputs for the user-facing ones (name +
 * status), so we track them here.
 *
 * 1.0.26 deleted the autosave engine. State transitions now match
 * the manual-save model:
 *
 *   markLoaded()  — bootstrap complete (gate against premature dirty).
 *   markDirty()   — user changed something; Save button lights up.
 *   markSaving()  — POST/PATCH in flight.
 *   markSaved()   — server confirmed the row hash; clear dirty + stamp lastSavedAt.
 *   setError(msg) — server reported a failure; clear isSaving + store msg.
 */
interface PersistenceState {
  /**
   * Whether the editor has finished bootstrapping (either no signature
   * to load, or fetched + setSchema'd successfully). The dirty-tracker
   * gates on this so loading doesn't flip `isDirty` immediately.
   */
  isLoaded: boolean;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  lastError: string | null;

  /**
   * Display name of the signature. Defaults to "Untitled" for new
   * rows; populated from the loaded row by `useLoadSignature`.
   * Editing this field via the Topbar input calls `markDirty()` to
   * flag unsaved changes — no network round-trip happens until the
   * user explicitly clicks Save / hits Cmd-S.
   */
  signatureName: string;
  /** Status — controls how the row is grouped in the listing. */
  signatureStatus: SignatureStatus;

  markLoaded: () => void;
  markDirty: () => void;
  markSaving: () => void;
  markSaved: () => void;
  setError: (message: string | null) => void;

  setSignatureName: (name: string) => void;
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
  setError: (message) => set({ lastError: message, isSaving: false }),

  setSignatureName: (signatureName) => set({ signatureName }),
  setSignatureStatus: (signatureStatus) => set({ signatureStatus }),
  hydrateRowMeta: ({ name, status }) =>
    set({ signatureName: name, signatureStatus: status }),
}));
