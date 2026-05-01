import { apiCall, ApiError, getConfig } from '@/bridge/apiClient';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useToastStore } from '@/stores/toastStore';
import type { SignatureSchema } from '@/core/schema/signature';
import { __ } from '@/i18n/helpers';

const AUTOSAVE_DELAY_MS = 1500;

/**
 * Persistence engine — owns the autosave timer, the signature id, the
 * URL sync, and the in-flight Promise.
 *
 * Module-level singleton so non-React surfaces (the topbar back-arrow,
 * keyboard shortcuts, beforeunload) can call `flushNow()` without
 * reaching back into a hook closure.
 *
 * Behaviour:
 *  - The very first save (when signatureId === 0) fires immediately,
 *    not on debounce — so the new row is created and the URL is
 *    rewritten with `?id=N` before the user can navigate away.
 *  - Subsequent saves debounce normally (1500ms).
 *  - If a save lands while another is in flight, the second one
 *    re-schedules itself for after the first completes — so we
 *    never POST twice for the same draft.
 *  - `flushNow()` cancels the debounce timer, runs any pending save
 *    immediately, and awaits any in-flight save. Awaitable.
 */
class PersistenceEngine {
  private signatureId = 0;
  private pendingTimer: number | null = null;
  private inFlight: Promise<void> | null = null;
  private initialized = false;

  /**
   * Bind to the bootstrap config. Idempotent.
   */
  initialize(): void {
    if (this.initialized) return;
    this.signatureId = getConfig().signatureId;
    this.initialized = true;
  }

  /**
   * Drop the in-memory signature id so the next save POSTs a new row.
   * Used when the configured `?id=` 404s — falling back to "new" is
   * better than PATCHing a non-existent row in a loop.
   */
  resetToNew(): void {
    this.signatureId = 0;
    // Mark initialized so a later `initialize()` call doesn't read the
    // stale id back out of the bootstrap config.
    this.initialized = true;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState(null, '', url.toString());
    } catch {
      // history API unavailable — non-fatal.
    }
  }

  /** True iff there's a debounce timer pending OR a save in flight. */
  hasPending(): boolean {
    return this.pendingTimer !== null || this.inFlight !== null;
  }

  /**
   * Manual-save entry point — used by the topbar Save button and the
   * Cmd/Ctrl + S shortcut.
   *
   * Cancels any debounce timer, runs an immediate save, and awaits
   * everything (including any coalesced follow-up). Resolves with
   * the signature id after the save lands so the caller can show
   * a "Saved as #N" confirmation.
   */
  async saveNow(): Promise<number> {
    // Force a save even if persistenceStore.isDirty is false — the
    // user pressed the button, give them confirmation regardless.
    usePersistenceStore.getState().markDirty();
    await this.flushNow();
    if (this.signatureId === 0) {
      // No save fired (probably an empty schema with nothing to write,
      // or the engine wasn't initialised yet). Run one more pass.
      void this.runSave();
      await this.flushNow();
    }
    return this.signatureId;
  }

  /**
   * Notify the engine that the schema changed. Schedules a save —
   * eager (immediate) for the very first one, debounced afterwards.
   */
  scheduleAutosave(): void {
    usePersistenceStore.getState().markDirty();

    if (this.pendingTimer !== null) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    // First save goes immediately so the new row is created and the
    // URL updated before any user-initiated navigation can race the
    // 1500ms debounce.
    if (this.signatureId === 0) {
      void this.runSave();
      return;
    }

    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      void this.runSave();
    }, AUTOSAVE_DELAY_MS);
  }

  /**
   * Flush any pending / in-flight save. Awaitable.
   *
   * Loops until both `pendingTimer` and `inFlight` are clear, because
   * a save that finishes here can re-schedule another via the
   * `runSave().finally(scheduleAutosave)` coalesce path — and that
   * second save also needs to land before navigation aborts it.
   * Concretely: user adds Block A (eager POST in flight), adds
   * Block B (re-schedules via finally), clicks back. Without the
   * loop, only Block A's POST awaits — the .finally fires after
   * the await, schedules Block B's PATCH, then page unload kills
   * the timer and Block B is lost.
   *
   * Hard cap at 5 iterations as a safety net against an infinite
   * coalesce chain (shouldn't be reachable in practice — every
   * save eventually either succeeds or errors out).
   */
  async flushNow(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      if (this.pendingTimer !== null) {
        window.clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
        void this.runSave();
      }
      if (this.inFlight) {
        try {
          await this.inFlight;
        } catch {
          // Errors are surfaced through the toast / persistenceStore;
          // we don't want to throw out of flushNow because callers
          // typically navigate immediately after.
        }
        // After awaiting, the IIFE's finally has cleared
        // `this.inFlight = null` AND any externally-attached
        // `.finally(scheduleAutosave)` has run, possibly setting a
        // new pendingTimer. Loop and re-check.
        continue;
      }
      // Nothing pending and nothing in-flight. Done.
      return;
    }
  }

  private async runSave(): Promise<void> {
    if (this.inFlight) {
      // Coalesce: re-schedule once the current save completes so the
      // newer schema state lands too. Avoids parallel POST/PATCH.
      this.inFlight.finally(() => {
        this.scheduleAutosave();
      });
      return;
    }

    const schema = useSchemaStore.getState().schema;
    const persistence = usePersistenceStore.getState();
    const showToast = useToastStore.getState().show;

    persistence.markSaving();

    this.inFlight = (async () => {
      try {
        if (this.signatureId > 0) {
          await apiCall(`/signatures/${this.signatureId}`, {
            method: 'PATCH',
            body: { json_content: schema },
          });
        } else {
          const created = await apiCall<{ id: number }>('/signatures', {
            method: 'POST',
            body: {
              name: schema.meta?.editor_version
                ? schemaTitleFallback(schema)
                : 'Untitled',
              json_content: schema,
            },
          });
          this.signatureId = created.id;

          // Reflect the new id in the URL so reload keeps editing this
          // signature. `replaceState` (not pushState) — no back-button
          // entry that would return to "no id".
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('id', String(created.id));
            window.history.replaceState(null, '', url.toString());
          } catch {
            // history API unavailable — non-fatal.
          }

          // Announce the freshly-minted ID so the user has a concrete
          // confirmation that a row was created (subtle reassurance
          // when the autosave races a quick navigation).
          showToast(
            __('Saved as signature #%s', String(created.id)),
            'success',
          );
        }

        persistence.markSaved();
      } catch (e) {
        const message = e instanceof ApiError ? e.message : (e as Error).message;
        persistence.setError(message);
        showToast(__('Save failed: %s', message), 'error');
        // Re-throw so flushNow's await can observe it (currently
        // swallowed, but kept for future caller-facing feedback).
        throw e;
      } finally {
        this.inFlight = null;
      }
    })();

    try {
      await this.inFlight;
    } catch {
      // Surface already happened via toast.
    }
  }
}

/**
 * "Untitled" is the default. If the schema has any meaningful content
 * we could derive a title from the first heading / first text snippet
 * here — for now, keep it simple, the user can rename later from the
 * listing.
 */
function schemaTitleFallback(_schema: SignatureSchema): string {
  return 'Untitled';
}

export const persistenceEngine = new PersistenceEngine();
