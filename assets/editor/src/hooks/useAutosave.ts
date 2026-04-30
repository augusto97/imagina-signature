import { useEffect, useRef } from 'react';
import { apiCall, ApiError, getConfig } from '@/bridge/apiClient';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useToastStore } from '@/stores/toastStore';
import { debounce } from '@/utils/debounce';
import { __ } from '@/i18n/helpers';

const AUTOSAVE_DELAY_MS = 1500;

/**
 * Persists schemaStore.schema to the REST API on a 1.5s debounce
 * (CLAUDE.md §6.7 / §13).
 *
 * For an existing signature (`signatureId > 0`) we PATCH; for a new
 * one we POST once and then pivot to PATCH on subsequent saves
 * (server returns the new id which we stash in the ref AND write
 * into the URL via `history.replaceState` so a reload keeps editing
 * the same row).
 *
 * Gates on {@link usePersistenceStore.isLoaded} so the load round-
 * trip doesn't trigger a redundant first save.
 */
export function useAutosave(): void {
  const schema = useSchemaStore((s) => s.schema);
  const isLoaded = usePersistenceStore((s) => s.isLoaded);
  const persistence = usePersistenceStore();
  const showToast = useToastStore((s) => s.show);

  const config = useRef(getConfig());
  const idRef = useRef<number>(config.current.signatureId);
  // Skip the first effect run AFTER isLoaded flips true — that run is
  // the load itself bouncing through the schemaStore, not a user edit.
  const skipNextSave = useRef(true);

  // Stable debounced save — re-creating it each render would reset
  // the timer on every keystroke.
  const saveRef = useRef<(payload: unknown) => void | null>();
  if (!saveRef.current) {
    saveRef.current = debounce(async (payload: unknown) => {
      try {
        persistence.markSaving();

        if (idRef.current > 0) {
          await apiCall(`/signatures/${idRef.current}`, {
            method: 'PATCH',
            body: payload,
          });
        } else {
          const created = (await apiCall('/signatures', {
            method: 'POST',
            body: {
              name: 'Untitled',
              json_content: (payload as { json_content: unknown }).json_content,
            },
          })) as { id: number };
          idRef.current = created.id;

          // Reflect the new id in the URL so a reload keeps editing
          // this signature instead of opening a fresh empty draft.
          // `replaceState` (not pushState) — we don't want a back-
          // button entry that returns to "no id".
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('id', String(created.id));
            window.history.replaceState(null, '', url.toString());
          } catch {
            // history API unavailable — non-fatal.
          }
        }

        persistence.markSaved();
      } catch (e) {
        const message = e instanceof ApiError ? e.message : (e as Error).message;
        persistence.setError(message);
        showToast(__('Save failed: %s', message), 'error');
      }
    }, AUTOSAVE_DELAY_MS);
  }

  useEffect(() => {
    // Wait for useLoadSignature to finish bootstrapping. Without this
    // gate, the very setSchema(loaded) call would be picked up here
    // and immediately re-PATCHed back to the server.
    if (!isLoaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    persistence.markDirty();
    saveRef.current?.({ json_content: schema });
    // We deliberately depend on `schema` + `isLoaded` only — persistence
    // helpers are stable references from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, isLoaded]);
}
