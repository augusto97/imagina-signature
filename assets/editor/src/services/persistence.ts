/**
 * Persistence engine — rewrite #2 (1.0.20).
 *
 * The previous implementation used a chain of `.finally(scheduleAutosave)`
 * callbacks to coalesce saves that arrived during an in-flight POST.
 * That chain raced with `flushNow()` in subtle ways — the navigation
 * back-arrow could exit before a `.finally`-scheduled timer fired, and
 * the user's most recent edits were lost. Multiple bugfix attempts
 * each introduced their own edge case.
 *
 * This rewrite uses a different model that's correct by construction:
 *
 *   - **One save at a time.** A single `inFlight` reference. While a
 *     save is running, no other save can start.
 *   - **Self-coalescing internal loop.** The save body is a `while
 *     (dirtySinceLastSave) { dirty = false; await save(); }` loop.
 *     Any change that happens during a save iteration sets `dirty` and
 *     gets picked up on the next iteration of the SAME loop — no
 *     promise chain, no re-entry, no race with `saveNow()`.
 *   - **`saveNow()` is just `clearTimeout + performSave + await`.**
 *     If `performSave` is already running, `saveNow` awaits it. The
 *     in-flight loop will see `dirty=true` and run another iteration
 *     before exiting, so on return everything is committed.
 *   - **Empty-schema protection.** If the user clicks Save with
 *     nothing edited and no signature id yet, we don't POST an empty
 *     row. Avoids the "two empty signatures appear in the listing"
 *     symptom that came from the old eager-first-save path.
 *
 * State is held on a module-level singleton so non-React surfaces
 * (back-arrow click, beforeunload) can reach it.
 */

import { apiCall, ApiError, getConfig } from '@/bridge/apiClient';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useToastStore } from '@/stores/toastStore';
import { __ } from '@/i18n/helpers';

const AUTOSAVE_DEBOUNCE_MS = 1500;

class Persistence {
  private signatureId = 0;
  private initialized = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  /**
   * Tracks whether the schema changed since the last save started.
   * Set by `scheduleSave()` / `saveNow()` and consumed by the
   * internal save loop in `performSave()`.
   */
  private dirty = false;

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

  /** True iff there's a debounce timer pending OR a save in flight. */
  hasPending(): boolean {
    return this.saveTimer !== null || this.inFlight !== null;
  }

  /**
   * Schedule a debounced save. Called from the schema-change effect
   * in `useAutosave`. Each call resets the timer — rapid keystrokes
   * collapse into one save 1500 ms after the last edit.
   */
  scheduleSave(): void {
    this.dirty = true;
    usePersistenceStore.getState().markDirty();

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.performSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  /**
   * Force-save now. Cancels the debounce, runs the save, awaits the
   * full coalesce loop. Resolves with the signature id (positive on
   * success, 0 if there was nothing to save).
   *
   * Called from:
   *   - The topbar "Save" button.
   *   - The Cmd/Ctrl + S keyboard shortcut.
   *   - The back-arrow click handler (so navigation never aborts an
   *     unfinished save).
   */
  async saveNow(): Promise<number> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    // Nothing dirty, already have an id → done.
    if (!this.dirty && this.signatureId > 0) {
      return this.signatureId;
    }

    // Nothing dirty, no id → no row to create. Refuse to POST an
    // empty signature — that's how the "two empty rows" symptom
    // happened in earlier versions.
    if (!this.dirty && this.signatureId === 0) {
      return 0;
    }

    await this.performSave();
    return this.signatureId;
  }

  /**
   * The actual save executor. Self-coalescing:
   *
   *   while (dirty) { dirty = false; await save(); }
   *
   * If a `scheduleSave()` / `saveNow()` arrives during an `await`
   * inside the loop, it sets `dirty = true` again and the next loop
   * iteration picks up the latest schema. No `.finally(scheduleSave)`
   * chains, no re-entry — concurrency control reduces to "is
   * `inFlight` set?".
   */
  private async performSave(): Promise<void> {
    if (this.inFlight) {
      // Already saving. The current loop will pick up `dirty=true`
      // on its next iteration. Wait for it to finish and exit.
      try {
        await this.inFlight;
      } catch {
        // Errors surface via toast / persistenceStore; swallow here.
      }
      // After the await, the loop exited because dirty was false at
      // the time. If something set dirty=true between iteration
      // check and now, it'll be picked up by the next scheduleSave
      // / saveNow call.
      return;
    }

    const persistence = usePersistenceStore.getState();
    const showToast = useToastStore.getState().show;

    this.inFlight = (async (): Promise<void> => {
      try {
        while (this.dirty) {
          this.dirty = false;
          persistence.markSaving();

          // Read the latest values inside the loop iteration so
          // edits made while the previous save was awaiting an
          // API response land on this iteration.
          const schema = useSchemaStore.getState().schema;
          const meta = usePersistenceStore.getState();
          const rowName = meta.signatureName.trim() || 'Untitled';
          const rowStatus = meta.signatureStatus;

          if (this.signatureId > 0) {
            await apiCall(`/signatures/${this.signatureId}`, {
              method: 'PATCH',
              body: {
                name: rowName,
                status: rowStatus,
                json_content: schema,
              },
            });
          } else {
            // Engine-side empty-schema guard. The schemaStore-side
            // `hasUserEdited` gate stops most empty saves, but
            // changing only the Name input bypasses it (a name
            // tweak isn't a schema edit). We still don't want the
            // listing to fill up with rows that have no blocks.
            // Skip the POST until at least one block exists.
            if (schema.blocks.length === 0) {
              continue;
            }
            const created = await apiCall<{ id: number }>('/signatures', {
              method: 'POST',
              body: {
                name: rowName,
                status: rowStatus,
                json_content: schema,
              },
            });

            // Persist the new id IMMEDIATELY before the next iteration
            // so subsequent loop runs PATCH instead of POST again.
            this.signatureId = created.id;

            try {
              const url = new URL(window.location.href);
              url.searchParams.set('id', String(created.id));
              window.history.replaceState(null, '', url.toString());
            } catch {
              // history API unavailable — non-fatal.
            }

            showToast(
              __('Saved as signature #%s', String(created.id)),
              'success',
            );
          }
        }

        persistence.markSaved();
      } catch (e) {
        const message = e instanceof ApiError ? e.message : (e as Error).message;
        persistence.setError(message);
        showToast(__('Save failed: %s', message), 'error');
        // Keep `dirty = true` so the next save attempt retries.
        this.dirty = true;
      } finally {
        this.inFlight = null;
      }
    })();

    try {
      await this.inFlight;
    } catch {
      // Surface already happened.
    }
  }
}

export const persistence = new Persistence();
