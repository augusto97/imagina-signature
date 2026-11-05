import { useEffect } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useEditorStore } from '@/stores/editorStore';
import { useClipboardStore } from '@/stores/clipboardStore';
import { useToastStore } from '@/stores/toastStore';
import { findParentAndIndex } from '@/stores/schemaUtils';
import { getBlockDefinition } from '@/core/blocks/registry';
import { migrateBlock } from '@/core/schema/migrate';
import { canPlaceAtDepth, locateBlock } from '@/core/schema/tree';
import { persistence } from '@/services/persistence';
import { __ } from '@/i18n/helpers';

/**
 * Whether the event target is somewhere the user types: inputs,
 * textareas, selects and any contenteditable (Tiptap).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

const COMPOSITE_ROLES = new Set([
  'combobox',
  'grid',
  'listbox',
  'menu',
  'menuitem',
  'option',
  'radio',
  'radiogroup',
  'slider',
  'spinbutton',
  'tab',
  'tablist',
  'tree',
  'treeitem',
]);

/**
 * Widgets that own their arrow keys: tabs, menus, sliders, … and
 * dnd-kit drag handles (they carry `aria-roledescription`; during a
 * keyboard drag the arrows move the dragged block).
 */
function ownsArrowKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[aria-roledescription]')) return true;
  const role = target.closest('[role]')?.getAttribute('role');
  return role !== null && role !== undefined && COMPOSITE_ROLES.has(role);
}

/**
 * Any modal open? Covers the editor-store modals (template picker,
 * export, preview, …) and locally-owned ones like the image cropper,
 * which render the shared Modal (`aria-modal="true"`).
 */
function isDialogOpen(): boolean {
  if (useEditorStore.getState().modal !== null) return true;
  return document.querySelector('[aria-modal="true"]') !== null;
}

function hasTextSelection(): boolean {
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
  return selection !== null && !selection.isCollapsed && selection.toString().length > 0;
}

function scrollBlockIntoView(id: string): void {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id;
  const el = document.querySelector(`[data-imgsig-block-id="${escaped}"]`);
  if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
    (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Editor-global keyboard shortcuts (CLAUDE.md §18.4):
 *
 *  - Cmd/Ctrl + S                       — save now (works while typing)
 *  - Cmd/Ctrl + Z                       — undo
 *  - Cmd/Ctrl + Shift + Z, Cmd/Ctrl + Y — redo
 *  - Cmd/Ctrl + D                       — duplicate selected block
 *  - Cmd/Ctrl + C                       — copy selected block (internal clipboard)
 *  - Cmd/Ctrl + V                       — paste block after the selection (or at the end);
 *                                         refused when it would nest containers too deep
 *  - Backspace / Delete                 — delete selected block
 *  - ArrowUp / ArrowDown                — select previous / next sibling block
 *  - Esc                                — clear selection
 *
 * Never hijacks keys while the user is typing (inputs, textareas,
 * selects, contenteditable / Tiptap), while a modal / dialog is open
 * (Backspace in the template picker used to delete the selected
 * block), or during IME composition. Cmd+C is left to the browser when there's a text
 * selection; arrows are left to widgets that own them (tabs, sliders,
 * drag handles).
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      // Manual save (Cmd/Ctrl + S) — bypasses the autosave debounce
      // and awaits the full save round-trip. Handled BEFORE the
      // input-focus bail so the user can hit Cmd-S while typing in
      // the Name input or any property field; otherwise the browser's
      // own "Save Page As" dialog wins.
      if (meta && key === 's') {
        event.preventDefault();
        void persistence.saveNow();
        return;
      }

      // Below this line: shortcuts that would conflict with normal
      // typing, or with an open dialog. Bail.
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      if (isDialogOpen()) return;

      const selection = useSelectionStore.getState();
      const schema = useSchemaStore.getState();
      const selectedId = selection.selectedBlockId;

      // Undo / Redo (store actions go through replaceSchemaForHistory,
      // which keeps both stacks intact).
      if (meta && !event.altKey && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          schema.redo();
        } else {
          schema.undo();
        }
        return;
      }
      if (meta && !event.altKey && !event.shiftKey && key === 'y') {
        event.preventDefault();
        schema.redo();
        return;
      }

      // Duplicate.
      if (meta && key === 'd' && selectedId) {
        event.preventDefault();
        schema.duplicateBlock(selectedId);
        return;
      }

      // Copy the selected block. Plain text selections keep the
      // browser's native copy.
      if (meta && !event.shiftKey && key === 'c' && selectedId && !hasTextSelection()) {
        const block = findParentAndIndex(schema.schema.blocks, selectedId);
        const original = block ? block.parent[block.index] : undefined;
        if (!original) return;
        event.preventDefault();
        useClipboardStore.getState().copy(original);
        useToastStore.getState().show(__('Block copied'), 'info', 1500);
        return;
      }

      // Paste after the selected block, or at the end of the canvas.
      if (meta && !event.shiftKey && key === 'v') {
        const copied = useClipboardStore.getState().read();
        if (!copied) return; // nothing of ours to paste — leave the event alone
        event.preventDefault();
        if (!getBlockDefinition(copied.type)) {
          useToastStore
            .getState()
            .show(__('The copied block type is not available in this editor.'), 'error');
          return;
        }
        const after =
          selectedId && findParentAndIndex(schema.schema.blocks, selectedId) ? selectedId : null;
        const anchor = after ? locateBlock(schema.schema.blocks, after) : null;
        const tooDeep = !canPlaceAtDepth(migrateBlock(copied), anchor ? anchor.depth : 0);
        const pastedId = schema.pasteBlock(copied, after);
        if (!pastedId) {
          // Pasting a container next to a block nested in another
          // container would nest containers two levels deep. (A paste
          // refused by a template lock already explained itself.)
          if (tooDeep) {
            useToastStore
              .getState()
              .show(__('Containers can only be nested one level deep.'), 'error');
          }
          return;
        }
        selection.select(pastedId);
        scrollBlockIntoView(pastedId);
        return;
      }

      if (meta || event.altKey) return;

      // Delete.
      if ((key === 'Backspace' || key === 'Delete') && selectedId) {
        event.preventDefault();
        if (schema.deleteBlock(selectedId)) selection.clearSelection();
        return;
      }

      // Move the selection between sibling blocks.
      if ((key === 'ArrowUp' || key === 'ArrowDown') && !event.shiftKey) {
        if (ownsArrowKeys(event.target)) return;
        const blocks = schema.schema.blocks;
        let nextId: string | undefined;
        if (selectedId) {
          const loc = findParentAndIndex(blocks, selectedId);
          if (loc) {
            nextId = loc.parent[key === 'ArrowUp' ? loc.index - 1 : loc.index + 1]?.id;
          }
        } else {
          nextId = (key === 'ArrowUp' ? blocks[blocks.length - 1] : blocks[0])?.id;
        }
        if (!nextId) return;
        event.preventDefault();
        selection.select(nextId);
        scrollBlockIntoView(nextId);
        return;
      }

      // Clear selection.
      if (key === 'Escape' && selectedId) {
        selection.clearSelection();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
