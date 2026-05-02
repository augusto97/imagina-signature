import { useEffect } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { persistence } from '@/services/persistence';

/**
 * Dirty-tracker hook (1.0.26).
 *
 * Replaces the old autosave hook. The autosave was deleted in 1.0.26
 * because it kept producing false-positive "Saved · HH:MM" toasts in
 * subtle edge cases that lied to the user about whether their work
 * was actually persisted (1.0.20 → 1.0.25 chased these one at a time
 * and never quite got there).
 *
 * What this hook does instead:
 *   1. Initialise the persistence engine with the bootstrap config.
 *   2. Watch for schema mutations (via `hasUserEdited`). When the
 *      user touches anything, flip the persistence store's `isDirty`
 *      flag so the topbar Save button lights up. NO network call.
 *   3. Install a `beforeunload` warning that fires whenever the user
 *      tries to leave with unsaved work — so the browser shows its
 *      "Leave / Stay" dialog and they don't lose anything by closing
 *      the tab. The back-arrow click handler awaits `saveNow()`
 *      explicitly; this listener is the safety net for everything
 *      else (address-bar nav, browser back, tab close).
 *
 * The user is now the source of truth for "should this save now?"
 * via the explicit Save button + Cmd-S shortcut. If they don't press
 * either, nothing is saved. The button label tells them honestly.
 */
export function useAutosave(): void {
  const hasUserEdited = useSchemaStore((s) => s.hasUserEdited);
  const isLoaded = usePersistenceStore((s) => s.isLoaded);
  const markDirty = usePersistenceStore((s) => s.markDirty);

  useEffect(() => {
    persistence.initialize();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!hasUserEdited) return;
    // Flip `isDirty` so the topbar Save button switches to its
    // "unsaved changes" tone. No network call here — the user
    // commits via the explicit Save button or Cmd-S.
    markDirty();
  }, [hasUserEdited, isLoaded, markDirty]);

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
