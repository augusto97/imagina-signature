import { useEffect } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { persistence } from '@/services/persistence';

/**
 * Autosave hook (1.0.28 — autosave restored).
 *
 * 1.0.26 deleted the autosave because the in-engine self-coalescing
 * loop kept producing false-positive "Saved" toasts in subtle edge
 * cases. 1.0.28 restores it but on the explicit-save model:
 * `scheduleSave()` is just a debounced wrapper around the same
 * `saveNow()` that the manual button uses. The backend hash-verify
 * (1.0.26) still catches any silent corruption, so no false-positive
 * toast can sneak through.
 *
 * What this hook does:
 *   1. Initialise the persistence engine with the bootstrap config.
 *   2. Watch for schema mutations (via `hasUserEdited`). On every
 *      change, flip `isDirty` so the topbar Save button lights up
 *      AND schedule an autosave 1500 ms after the last edit.
 *   3. Install a `beforeunload` warning that fires whenever the
 *      document is dirty / a save is in flight / a save is pending,
 *      so accidental tab-close can't drop work.
 *
 * The Save button + Cmd-S still preempt the autosave timer when the
 * user wants to commit immediately.
 */
export function useAutosave(): void {
  const schema = useSchemaStore((s) => s.schema);
  const hasUserEdited = useSchemaStore((s) => s.hasUserEdited);
  const isLoaded = usePersistenceStore((s) => s.isLoaded);
  const markDirty = usePersistenceStore((s) => s.markDirty);

  useEffect(() => {
    persistence.initialize();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!hasUserEdited) return;
    // Two parallel signals: flip `isDirty` so the topbar reflects
    // unsaved state, AND schedule the debounced autosave so the
    // user doesn't have to remember to click Save for incremental
    // edits. The schedule is reset on every dependency change, so
    // a burst of typing collapses into one save 1500 ms after the
    // last keystroke.
    markDirty();
    persistence.scheduleSave();
  }, [schema, hasUserEdited, isLoaded, markDirty]);

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
