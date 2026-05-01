import { useEffect, useRef } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { persistenceEngine } from '@/services/persistenceEngine';

/**
 * Wires schemaStore changes → persistenceEngine. The engine handles
 * debouncing, eager first-save, in-flight tracking, and URL sync.
 *
 * Two effects:
 *   1. On every schema change (after isLoaded), schedule a save.
 *   2. Install a `beforeunload` warning while anything is pending so
 *      the user gets the browser's "leave / stay" dialog instead of
 *      silently losing work.
 *
 * Gates on `persistenceStore.isLoaded` so the load round-trip's
 * setSchema doesn't itself trigger a redundant save.
 */
export function useAutosave(): void {
  const schema = useSchemaStore((s) => s.schema);
  const isLoaded = usePersistenceStore((s) => s.isLoaded);
  const skipNextSave = useRef(true);

  // Bind the engine to the bootstrap config once.
  useEffect(() => {
    persistenceEngine.initialize();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    persistenceEngine.scheduleAutosave();
  }, [schema, isLoaded]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const { isDirty, isSaving } = usePersistenceStore.getState();
      if (isDirty || isSaving || persistenceEngine.hasPending()) {
        event.preventDefault();
        // returnValue is required for the dialog to render in
        // Chromium / Safari; Firefox ignores the string anyway.
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
}
