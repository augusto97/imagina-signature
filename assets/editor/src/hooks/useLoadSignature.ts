import { useEffect, useState } from 'react';
import { apiCall, ApiError, getConfig } from '@/bridge/apiClient';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useToastStore } from '@/stores/toastStore';
import { persistence } from '@/services/persistence';
import type { SignatureSchema } from '@/core/schema/signature';
import { __ } from '@/i18n/helpers';

interface SignatureRow {
  id: number;
  name: string;
  status: 'draft' | 'ready' | 'archived';
  json_content: SignatureSchema;
}

interface LoadState {
  loading: boolean;
  notFound: boolean;
  error: string | null;
}

/**
 * Loads the signature identified by `IMGSIG_EDITOR_CONFIG.signatureId`
 * once on mount. When the id is `0` (new signature flow), nothing is
 * fetched but `markLoaded()` still fires so the autosave gate opens.
 *
 * On success the schema replaces the in-store empty default and the
 * history stack is cleared (setSchema does this). On failure the user
 * sees an error toast and the editor still becomes interactive — they
 * can either retry or start fresh.
 */
export function useLoadSignature(): LoadState {
  const setSchema = useSchemaStore((s) => s.setSchema);
  const markLoaded = usePersistenceStore((s) => s.markLoaded);
  const hydrateRowMeta = usePersistenceStore((s) => s.hydrateRowMeta);
  const showToast = useToastStore((s) => s.show);
  const [state, setState] = useState<LoadState>({
    loading: getConfig().signatureId > 0,
    notFound: false,
    error: null,
  });

  useEffect(() => {
    const { signatureId } = getConfig();
    if (signatureId === 0) {
      markLoaded();
      return;
    }

    let cancelled = false;
    apiCall<SignatureRow>(`/signatures/${signatureId}`)
      .then((row) => {
        if (cancelled) return;
        if (row.json_content && typeof row.json_content === 'object') {
          setSchema(row.json_content);
        }
        // Populate the topbar's Name + Status from the loaded row so
        // the user can edit them. Status defaults to 'draft' when the
        // server didn't include it (back-compat with very old rows).
        hydrateRowMeta({
          name: row.name || 'Untitled',
          status: row.status ?? 'draft',
        });
        setState({ loading: false, notFound: false, error: null });
        markLoaded();
      })
      .catch((e) => {
        if (cancelled) return;
        const isNotFound = e instanceof ApiError && e.status === 404;
        const message = e instanceof ApiError ? e.message : (e as Error).message;
        setState({ loading: false, notFound: isNotFound, error: message });
        if (isNotFound) {
          // Stale `?id=` (signature was deleted, user typed wrong id):
          // reset the engine to "new" so the user's edits create a
          // fresh row instead of PATCH-looping a 404.
          persistence.resetToNew();
        } else {
          showToast(__('Could not load signature: %s', message), 'error');
        }
        // Open the autosave gate either way so the user can recover
        // by editing — the next save will land on the right row.
        markLoaded();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
