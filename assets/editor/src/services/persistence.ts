/**
 * Persistence engine — rewrite #3 (1.0.26).
 *
 * The autosave + self-coalescing-loop model from 1.0.20 → 1.0.25 kept
 * producing edge cases that lied to the user about whether their work
 * was actually saved (false-positive `markSaved`, empty-row creation,
 * etc.). 1.0.26 deletes the autosave entirely.
 *
 * The new model is much smaller and verifiable end-to-end:
 *
 *   1. The user edits the schema. `markDirty()` flips a flag. No
 *      network call happens. The Save button lights up.
 *   2. The user clicks Save (or hits Cmd-S, or the back-arrow / page-
 *      unload listener fires).
 *   3. `saveNow()` runs ONE round-trip:
 *        a. POST /signatures   (when signatureId === 0)
 *           OR
 *           PATCH /signatures/:id
 *        b. Backend writes, re-reads, hash-verifies the row, returns
 *           the canonical persisted state.
 *        c. Frontend compares its sent json_content against the
 *           response's json_content. If they differ, it surfaces a
 *           warning so the user knows the server changed something.
 *      The Save button shows "Saving…" → "Saved · HH:MM" / "Failed"
 *      based on the actual outcome.
 *   4. `beforeunload` warns the user when `isDirty` is true so they
 *      can't lose work by accident.
 *
 * No timers. No `dirty/inFlight` race surfaces. The Save button is
 * the ONE way to commit. If it doesn't toast "Saved", nothing landed.
 */

import { apiCall, ApiError, getConfig } from '@/bridge/apiClient';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useToastStore } from '@/stores/toastStore';
import { __ } from '@/i18n/helpers';

/**
 * Debounce window between the user's last edit and the autosave
 * firing. 1500 ms balances "saves often enough that the user can't
 * lose much by closing the tab" against "doesn't slam the server on
 * every keystroke".
 */
const AUTOSAVE_DEBOUNCE_MS = 1500;

class Persistence {
  private signatureId = 0;
  private initialized = false;
  /**
   * In-flight save promise, exposed so concurrent `saveNow()` calls
   * (rapid Cmd-S double-tap, button click during the back-arrow's
   * own save) chain off the same network request rather than
   * launching duplicates.
   */
  private inFlight: Promise<number> | null = null;
  /**
   * Timer handle for the pending autosave. `scheduleSave()` resets
   * it on every call, so a burst of edits collapses into one save
   * 1500 ms after the LAST edit. `saveNow()` clears it.
   */
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Bind to the bootstrap config. Idempotent. */
  initialize(): void {
    if (this.initialized) return;
    this.signatureId = getConfig().signatureId;
    this.initialized = true;
  }

  /**
   * Drop the in-memory signature id so the next save POSTs a fresh
   * row. Called from `useLoadSignature` when `?id=N` 404s — falling
   * back to "new" is better than PATCH-looping a non-existent row.
   */
  resetToNew(): void {
    this.signatureId = 0;
    this.initialized = true;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState(null, '', url.toString());
    } catch {
      // history API unavailable — non-fatal.
    }
  }

  /**
   * Schedule a debounced autosave. `useAutosave` calls this on every
   * schema mutation (1.0.28 — autosave restored after 1.0.26 deleted
   * it). Each call resets the timer; rapid edits collapse into one
   * save AUTOSAVE_DEBOUNCE_MS ms after the last edit.
   *
   * The save itself goes through the same `saveNow()` path as the
   * manual Save button, so the backend hash-verify still catches any
   * silent corruption — but the user no longer has to remember to
   * click Save for incremental edits to land.
   */
  scheduleSave(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.saveNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  /** Cancel any pending autosave. Used by the back-arrow handler. */
  cancelScheduledSave(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  /** True iff a save is currently in flight or queued. */
  hasPending(): boolean {
    return this.inFlight !== null || this.autosaveTimer !== null;
  }

  /**
   * Force-save now. The single entry point — called from the topbar
   * Save button, the Cmd-S keyboard shortcut, and the back-arrow.
   *
   * Returns the assigned signature id on success (positive integer)
   * OR 0 when the save was refused (empty signature). Throws if the
   * server reported a persistence failure — the caller's catch
   * handler is responsible for the user-facing error toast (the
   * engine already surfaced its own toast and stored the error in
   * `persistenceStore.lastError`).
   */
  async saveNow(): Promise<number> {
    // Cancel any pending autosave — `saveNow` always preempts the
    // debounced timer to avoid a back-to-back save right after a
    // manual one.
    this.cancelScheduledSave();

    // Coalesce concurrent calls onto the same in-flight request.
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.runSave();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  /**
   * Body of one save round-trip. Reads the latest schema + meta off
   * the stores, POSTs / PATCHes it, compares the response to what we
   * sent, updates the persistence store with the outcome.
   */
  private async runSave(): Promise<number> {
    const persistence = usePersistenceStore.getState();
    const showToast = useToastStore.getState().show;

    const schema = useSchemaStore.getState().schema;
    const meta = usePersistenceStore.getState();
    const rowName = meta.signatureName.trim() || 'Untitled';
    const rowStatus = meta.signatureStatus;

    // Refuse to POST a brand-new row whose canvas has zero blocks.
    // The server would happily store it, but the listing would show
    // a phantom empty row that the user has to manually delete.
    // PATCH on an existing signature is allowed even when blocks ===
    // 0 (the user might be intentionally clearing the canvas).
    if (this.signatureId === 0 && schema.blocks.length === 0) {
      showToast(
        __('Add at least one block before saving — empty signatures are not stored.'),
        'info',
      );
      return 0;
    }

    persistence.markSaving();

    type SaveResponse = {
      id: number;
      json_content: unknown;
      name: string;
      status: 'draft' | 'ready' | 'archived';
    };

    try {
      let response: SaveResponse;
      if (this.signatureId > 0) {
        response = await apiCall<SaveResponse>(`/signatures/${this.signatureId}`, {
          method: 'PATCH',
          body: { name: rowName, status: rowStatus, json_content: schema },
        });
      } else {
        response = await apiCall<SaveResponse>('/signatures', {
          method: 'POST',
          body: { name: rowName, status: rowStatus, json_content: schema },
        });

        // Stamp the new id in memory + URL BEFORE we toast success
        // so a refresh during the toast lands on the right row.
        if (typeof response?.id !== 'number' || response.id <= 0) {
          throw new Error('Server returned no signature id on create.');
        }
        this.signatureId = response.id;
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('id', String(response.id));
          window.history.replaceState(null, '', url.toString());
        } catch {
          // history API unavailable — non-fatal.
        }
      }

      // Defence in depth: the backend already hash-verifies the row,
      // but we do a client-side sanity check too. If the server's
      // returned json_content doesn't deep-equal what we sent, that's
      // a bug somewhere (filter mutating the schema, sanitiser
      // dropping a field, etc.) and the user should know the saved
      // state isn't quite what they typed.
      const sent = JSON.stringify(schema);
      const got = JSON.stringify(response.json_content ?? null);
      if (sent !== got) {
        showToast(
          __(
            'Saved, but the server-stored copy differs from what you sent. Reload to see the canonical version.',
          ),
          'info',
        );
      }

      persistence.markSaved();
      showToast(
        this.signatureId > 0
          ? __('Saved (signature #%s).', String(this.signatureId))
          : __('Saved.'),
        'success',
      );
      return this.signatureId;
    } catch (e) {
      const message =
        e instanceof ApiError
          ? `${e.message} [${e.code}, ${e.status}]`
          : (e as Error).message;
      persistence.setError(message);
      showToast(__('Save failed: %s', message), 'error');
      // Don't rethrow — the caller (back-arrow handler, etc.) should
      // be able to await without a try/catch and decide what to do
      // based on `persistenceStore.lastError`.
      return 0;
    }
  }
}

export const persistence = new Persistence();
