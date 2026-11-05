import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '@/editor/shortcuts/useKeyboardShortcuts';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useEditorStore } from '@/stores/editorStore';
import { useClipboardStore, BLOCK_CLIPBOARD_STORAGE_KEY } from '@/stores/clipboardStore';
import { collectBlockIds } from '@/stores/schemaUtils';
import { createEmptySchema } from '@/core/schema/signature';
import type { ContainerBlock, TextBlock } from '@/core/schema/blocks';
import '@/core/blocks';

const text = (id: string, content = id): TextBlock => ({
  id,
  type: 'text',
  content,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

function seed(): void {
  const schema = createEmptySchema();
  const cnt: ContainerBlock = {
    id: 'cnt',
    type: 'container',
    columns: 2,
    gap: 16,
    children: [text('l1'), text('l2')],
    right_children: [text('r1')],
  };
  schema.blocks.push(text('a'), cnt, text('b'));
  useSchemaStore.setState({ schema, hasUserEdited: false });
  useHistoryStore.setState({ past: [], future: [] });
  useSelectionStore.setState({ selectedBlockId: null, hoveredBlockId: null });
  useEditorStore.setState({ modal: null });
  endHistoryBurst();
}

const press = (key: string, init: Partial<KeyboardEventInit> = {}, target: Element | Document = document.body) =>
  fireEvent.keyDown(target, { key, bubbles: true, cancelable: true, ...init });

const selected = (): string | null => useSelectionStore.getState().selectedBlockId;
const topIds = (): string[] => useSchemaStore.getState().schema.blocks.map((b) => b.id);
const textOf = (id: string): string =>
  (useSchemaStore.getState().schema.blocks.find((b) => b.id === id) as TextBlock).content;

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    seed();
    window.localStorage.clear();
    useClipboardStore.setState({ block: null });
    renderHook(() => useKeyboardShortcuts());
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Ctrl+Z undoes a property edit; Ctrl+Y and Ctrl+Shift+Z redo it', () => {
    useSchemaStore.getState().updateBlock('a', { content: 'changed' });

    press('z', { ctrlKey: true });
    expect(textOf('a')).toBe('a');

    press('y', { ctrlKey: true });
    expect(textOf('a')).toBe('changed');

    press('z', { metaKey: true });
    expect(textOf('a')).toBe('a');
    press('Z', { metaKey: true, shiftKey: true });
    expect(textOf('a')).toBe('changed');
  });

  it('ArrowDown / ArrowUp move the selection between siblings', () => {
    press('ArrowDown');
    expect(selected()).toBe('a');
    press('ArrowDown');
    expect(selected()).toBe('cnt');
    press('ArrowDown');
    expect(selected()).toBe('b');
    press('ArrowDown'); // stays on the last sibling
    expect(selected()).toBe('b');
    press('ArrowUp');
    expect(selected()).toBe('cnt');

    // Nested: siblings within the same cell.
    useSelectionStore.getState().select('l1');
    press('ArrowDown');
    expect(selected()).toBe('l2');
    press('ArrowDown');
    expect(selected()).toBe('l2');
  });

  it('Escape clears the selection', () => {
    useSelectionStore.getState().select('a');
    press('Escape');
    expect(selected()).toBeNull();
  });

  it('copy / paste duplicates the block after the selection with fresh ids', () => {
    useSelectionStore.getState().select('cnt');
    press('c', { ctrlKey: true });
    expect(window.localStorage.getItem(BLOCK_CLIPBOARD_STORAGE_KEY)).toContain('"cnt"');

    useSelectionStore.getState().select('a');
    press('v', { ctrlKey: true });
    const ids = topIds();
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe('a');
    expect(ids[1]).not.toBe('cnt');
    expect(ids.slice(2)).toEqual(['cnt', 'b']);
    expect(selected()).toBe(ids[1]);

    const all = collectBlockIds(useSchemaStore.getState().schema.blocks);
    expect(new Set(all).size).toBe(all.length);

    // Undo removes the paste in one step.
    press('z', { ctrlKey: true });
    expect(topIds()).toEqual(['a', 'cnt', 'b']);
  });

  it('paste works across signatures via localStorage and appends without a selection', () => {
    useSelectionStore.getState().select('b');
    press('c', { ctrlKey: true });

    // "Open another signature": new schema, fresh in-memory clipboard.
    useSchemaStore.getState().setSchema(createEmptySchema());
    useClipboardStore.setState({ block: null });
    useSelectionStore.getState().clearSelection();

    press('v', { ctrlKey: true });
    const blocks = useSchemaStore.getState().schema.blocks as TextBlock[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toBe('b');
    expect(blocks[0]?.id).not.toBe('b');
  });

  it('never hijacks keys while typing in inputs or contenteditable', () => {
    useSelectionStore.getState().select('a');
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('Backspace', {}, input);
    press('ArrowDown', {}, input);
    press('c', { ctrlKey: true }, input);
    expect(topIds()).toEqual(['a', 'cnt', 'b']);
    expect(selected()).toBe('a');
    expect(window.localStorage.getItem(BLOCK_CLIPBOARD_STORAGE_KEY)).toBeNull();

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inner = document.createElement('p');
    editable.appendChild(inner);
    document.body.appendChild(editable);
    press('Backspace', {}, inner);
    press('z', { ctrlKey: true }, inner);
    expect(topIds()).toEqual(['a', 'cnt', 'b']);
  });

  it('ignores block shortcuts while a modal is open', () => {
    useSelectionStore.getState().select('a');
    useEditorStore.setState({ modal: 'template-picker' });
    press('Backspace');
    expect(topIds()).toEqual(['a', 'cnt', 'b']);

    useEditorStore.setState({ modal: null });
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    press('Delete');
    expect(topIds()).toEqual(['a', 'cnt', 'b']);
  });

  it('leaves arrow keys to widgets that own them (tabs, drag handles)', () => {
    useSelectionStore.getState().select('a');
    const tab = document.createElement('button');
    tab.setAttribute('role', 'tab');
    document.body.appendChild(tab);
    press('ArrowDown', {}, tab);
    expect(selected()).toBe('a');

    const handle = document.createElement('button');
    handle.setAttribute('aria-roledescription', 'sortable');
    document.body.appendChild(handle);
    press('ArrowDown', {}, handle);
    expect(selected()).toBe('a');
  });

  it('leaves Ctrl+V alone when the internal clipboard is empty', () => {
    const spy = vi.fn();
    document.addEventListener('keydown', spy);
    press('v', { ctrlKey: true });
    const event = spy.mock.calls[0]?.[0] as KeyboardEvent;
    expect(event.defaultPrevented).toBe(false);
    document.removeEventListener('keydown', spy);
    expect(topIds()).toEqual(['a', 'cnt', 'b']);
  });

  it('Backspace deletes the selected block', () => {
    useSelectionStore.getState().select('b');
    press('Backspace');
    expect(topIds()).toEqual(['a', 'cnt']);
    expect(selected()).toBeNull();
  });
});
