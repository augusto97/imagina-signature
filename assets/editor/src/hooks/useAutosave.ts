import { useEffect } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { persistence } from '@/services/persistence';

/**
 * Wires schemaStore changes → persistence engine. The engine
 * handles debouncing + the self-coalescing save loop; this hook
 * is just the React-side glue.
 *
 * Three effects:
 *   1. Bind the engine to the bootstrap config once.
 *   2. On every schema change, schedule a save IF the user has
 *      actually edited (`hasUserEdited` flag in schemaStore).
 *      Without that gate, opening the editor without doing
 *      anything could trigger a POST that creates an empty
 *      signature row in the listing — that's how the user reported
 *      "deleted everything, created one signature, ended up with
 *      two empty rows" in 1.0.21.
 *   3. Install a `beforeunload` warning while anything is pending so
 *      the user gets the browser's "leave / stay" dialog instead of
 *      silently losing work.
 *
 * Gates on `persistenceStore.isLoaded` AND `schemaStore.hasUserEdited`.
 * The latter is the more important guard — it directly tracks whether
 * the user did anything, regardless of which lifecycle event triggered
 * the schema reference change.
 */
export function useAutosave(): void {
  const schema = useSchemaStore((s) => s.schema);
  const hasUserEdited = useSchemaStore((s) => s.hasUserEdited);
  const isLoaded = usePersistenceStore((s) => s.isLoaded);

  useEffect(() => {
    persistence.initialize();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    // The user-edit gate is the safety net against empty-row POSTs.
    // Loading a signature, applying a template, or any other
    // non-user setSchema clears `hasUserEdited`, so this effect's
    // dependency change doesn't translate into a save.
    if (!hasUserEdited) return;
    persistence.scheduleSave();
  }, [schema, isLoaded, hasUserEdited]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const { isDirty, isSaving } = usePersistenceStore.getState();
      if (isDirty || isSaving || persistence.hasPending()) {
        event.preventDefault();
        // `returnValue` is required for the dialog to render in
        // Chromium / Safari; Firefox ignores the string.
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
}
