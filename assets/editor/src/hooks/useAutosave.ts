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
 * (server returns the new id which we stash in the ref).
 *
 * Skips the very first run so loading a signature doesn't trigger
 * a no-op save.
 */
export function useAutosave(): void {
  const schema = useSchemaStore((s) => s.schema);
  const persistence = usePersistenceStore();
  const showToast = useToastStore((s) => s.show);

  const initial = useRef(true);
  const config = useRef(getConfig());
  const idRef = useRef<number>(config.current.signatureId);

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
            body: { name: 'Untitled', json_content: (payload as { json_content: unknown }).json_content },
          })) as { id: number };
          idRef.current = created.id;
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
    if (initial.current) {
      initial.current = false;
      return;
    }
    persistence.markDirty();
    saveRef.current?.({ json_content: schema });
    // We deliberately depend on `schema` only — persistence helpers
    // are stable references from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);
}
