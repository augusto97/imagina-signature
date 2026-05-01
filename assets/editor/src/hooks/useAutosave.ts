import { useEffect, useRef } from 'react';
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
 *   2. On every schema change (once `isLoaded`), schedule a save.
 *   3. Install a `beforeunload` warning while anything is pending so
 *      the user gets the browser's "leave / stay" dialog instead of
 *      silently losing work.
 *
 * Gates on `persistenceStore.isLoaded` so the load round-trip's
 * `setSchema` doesn't itself trigger a redundant save.
 */
export function useAutosave(): void {
  const schema = useSchemaStore((s) => s.schema);
  const isLoaded = usePersistenceStore((s) => s.isLoaded);
  const skipNextSave = useRef(true);

  useEffect(() => {
    persistence.initialize();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    // Skip the first run after `isLoaded` flips true — that change
    // is the load itself bouncing through schemaStore, not a user edit.
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    persistence.scheduleSave();
  }, [schema, isLoaded]);

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
