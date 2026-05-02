import { useEffect } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useHistoryStore } from '@/stores/historyStore';
import { persistence } from '@/services/persistence';

/**
 * Editor-global keyboard shortcuts (CLAUDE.md §18.4):
 *
 *  - Cmd/Ctrl + Z         — undo
 *  - Cmd/Ctrl + Shift + Z — redo
 *  - Cmd/Ctrl + D         — duplicate selected block
 *  - Backspace / Delete   — delete selected block
 *  - Esc                  — clear selection
 *
 * Listens on `document` and bails when the focused element is an
 * input / textarea so typed shortcuts don't fight the property panel.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField =
        (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) ||
        target?.isContentEditable === true;

      const meta = event.metaKey || event.ctrlKey;
      const selection = useSelectionStore.getState();
      const schema = useSchemaStore.getState();
      const history = useHistoryStore.getState();

      // Manual save (Cmd/Ctrl + S) — bypasses the autosave debounce
      // and awaits the full save round-trip. Handled BEFORE the
      // input-focus bail so the user can hit Cmd-S while typing in
      // the Name input or any property field; otherwise the browser's
      // own "Save Page As" dialog wins.
      if (meta && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        void persistence.saveNow();
        return;
      }

      // Below this line: shortcuts that would conflict with normal
      // typing in a focused input. Bail.
      if (inField) return;

      // Undo / Redo. MUST go through `replaceSchemaForHistory` (not
      // `setSchema`), otherwise setSchema clears the history stack
      // and undo collapses to single-step.
      if (meta && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) {
          const next = history.redo(schema.schema);
          if (next) schema.replaceSchemaForHistory(next);
        } else {
          const previous = history.undo(schema.schema);
          if (previous) schema.replaceSchemaForHistory(previous);
        }
        return;
      }

      // Duplicate.
      if (meta && (event.key === 'd' || event.key === 'D') && selection.selectedBlockId) {
        event.preventDefault();
        schema.duplicateBlock(selection.selectedBlockId);
        return;
      }

      // Delete.
      if (
        (event.key === 'Backspace' || event.key === 'Delete') &&
        selection.selectedBlockId
      ) {
        event.preventDefault();
        schema.deleteBlock(selection.selectedBlockId);
        selection.clearSelection();
        return;
      }

      // Clear selection.
      if (event.key === 'Escape') {
        selection.clearSelection();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
