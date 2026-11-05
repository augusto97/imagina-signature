/**
 * "Detach from template" (1.3.0): turns a linked signature into a free
 * copy. Its blocks already carry the employee's text overrides, so the
 * design is kept exactly as it is; the server sets `link_mode` to
 * `detached` and drops `overrides` (it refuses when the template's
 * employee mode isn't `free`, unless the user manages templates).
 */

import { apiCall, ApiError } from '@/bridge/apiClient';
import { detachedSchema } from '@/core/schema/locks';
import type { SignatureSchema } from '@/core/schema/signature';
import { useLinkStore } from '@/stores/linkStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useToastStore } from '@/stores/toastStore';
import { compileForServer, persistence } from '@/services/persistence';
import { __ } from '@/i18n/helpers';

interface DetachResponse {
  id: number;
  link_mode?: 'linked' | 'detached';
  json_content?: unknown;
}

function isSchema(value: unknown): value is SignatureSchema {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { blocks?: unknown }).blocks)
  );
}

/** Detaches the signature being edited. Resolves to true on success. */
export async function detachFromTemplate(): Promise<boolean> {
  const toast = useToastStore.getState().show;

  // Flush pending edits first so nothing is lost — and so the PATCH
  // below is the last word on this row.
  if (persistence.hasPending() || usePersistenceStore.getState().isDirty) {
    await persistence.saveNow({ silent: true });
  }
  const id = persistence.currentId();
  if (id <= 0) return false;

  const schema = detachedSchema(useSchemaStore.getState().schema);
  const compiled = compileForServer(schema);
  const meta = usePersistenceStore.getState();

  try {
    const row = await apiCall<DetachResponse>(`/signatures/${id}`, {
      method: 'PATCH',
      body: {
        name: meta.signatureName.trim() || __('Untitled'),
        status: meta.signatureStatus,
        link_mode: 'detached',
        json_content: schema,
        ...(compiled ? { html: compiled.html, text: compiled.text } : {}),
      },
    });
    useLinkStore.getState().setLink({ mode: 'detached' });
    useSchemaStore.getState().setSchema(isSchema(row.json_content) ? row.json_content : schema);
    usePersistenceStore.getState().markSaved();
    toast(
      __('Detached. This signature is now your own copy and no longer follows the template.'),
      'success',
    );
    return true;
  } catch (e) {
    const message = e instanceof ApiError ? e.message : (e as Error).message;
    toast(__('Could not detach the signature: %s', message), 'error');
    return false;
  }
}
