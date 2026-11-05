import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSchemaStore, endHistoryBurst, HISTORY_COALESCE_MS } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';

/**
 * Property edits must be undoable, but one keystroke must not equal
 * one undo step. Edits are coalesced into "bursts": a burst opens a
 * history snapshot on its first change and swallows follow-up changes
 * to the same block + field made less than HISTORY_COALESCE_MS apart.
 */

const text = (id: string, content = ''): TextBlock => ({
  id,
  type: 'text',
  content,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000000' },
});

function seed(blocks: TextBlock[]): void {
  const schema = createEmptySchema();
  schema.blocks.push(...blocks);
  useSchemaStore.setState({ schema, hasUserEdited: false });
  useHistoryStore.setState({ past: [], future: [] });
  endHistoryBurst();
}

function block(id: string): TextBlock {
  return useSchemaStore.getState().schema.blocks.find((b) => b.id === id) as TextBlock;
}

/** Simulate typing: one updateBlock per character, 50 ms apart. */
function type(id: string, sentence: string): void {
  let acc = block(id).content;
  for (const ch of sentence) {
    acc += ch;
    useSchemaStore.getState().updateBlock(id, { content: acc });
    vi.advanceTimersByTime(50);
  }
}

describe('history coalescing for property edits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    seed([text('a', ''), text('b', 'B')]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('typing a sentence is a single undo step', () => {
    type('a', 'Hello world');
    expect(block('a').content).toBe('Hello world');
    expect(useHistoryStore.getState().past).toHaveLength(1);

    expect(useSchemaStore.getState().undo()).toBe(true);
    expect(block('a').content).toBe('');
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });

  it('a pause longer than the coalesce window opens a new step', () => {
    type('a', 'Hello');
    vi.advanceTimersByTime(HISTORY_COALESCE_MS + 10);
    type('a', ' world');

    expect(useHistoryStore.getState().past).toHaveLength(2);
    useSchemaStore.getState().undo();
    expect(block('a').content).toBe('Hello');
    useSchemaStore.getState().undo();
    expect(block('a').content).toBe('');
  });

  it('changing a color then a size are two undo steps even within the window', () => {
    const s = block('a').style;
    useSchemaStore.getState().updateBlock('a', { style: { ...s, color: '#ff0000' } });
    vi.advanceTimersByTime(100);
    useSchemaStore
      .getState()
      .updateBlock('a', { style: { ...block('a').style, font_size: 20 } });

    expect(useHistoryStore.getState().past).toHaveLength(2);

    useSchemaStore.getState().undo();
    expect(block('a').style.font_size).toBe(14);
    expect(block('a').style.color).toBe('#ff0000');

    useSchemaStore.getState().undo();
    expect(block('a').style.color).toBe('#000000');
  });

  it('dragging a colour picker (many rapid changes) is one step', () => {
    for (let i = 0; i < 30; i++) {
      useSchemaStore
        .getState()
        .updateBlock('a', { style: { ...block('a').style, color: `#0000${(i + 10).toString(16)}` } });
      vi.advanceTimersByTime(16);
    }
    expect(useHistoryStore.getState().past).toHaveLength(1);
  });

  it('editing a different block starts a new step', () => {
    type('a', 'x');
    type('b', 'y');
    expect(useHistoryStore.getState().past).toHaveLength(2);
  });

  it('no-op writes neither push history nor mark the document edited', () => {
    useSchemaStore.getState().updateBlock('b', { content: 'B' });
    expect(useHistoryStore.getState().past).toHaveLength(0);
    expect(useSchemaStore.getState().hasUserEdited).toBe(false);
  });

  it('redo restores the edit after an undo, and a new edit clears redo', () => {
    type('a', 'Hi');
    useSchemaStore.getState().undo();
    expect(block('a').content).toBe('');
    expect(useHistoryStore.getState().future).toHaveLength(1);

    expect(useSchemaStore.getState().redo()).toBe(true);
    expect(block('a').content).toBe('Hi');
    expect(useHistoryStore.getState().future).toHaveLength(0);

    useSchemaStore.getState().undo();
    // A fresh edit right after undo must open its own step (the undo
    // closed the burst) and invalidate the redo stack.
    type('a', 'Yo');
    expect(useHistoryStore.getState().future).toHaveLength(0);
    useSchemaStore.getState().undo();
    expect(block('a').content).toBe('');
  });

  it('a structural change closes the burst', () => {
    type('a', 'ab');
    useSchemaStore.getState().addBlock(text('c'));
    type('a', 'cd');
    // burst 1 + addBlock + burst 2
    expect(useHistoryStore.getState().past).toHaveLength(3);
    useSchemaStore.getState().undo();
    expect(block('a').content).toBe('ab');
  });

  it('canvas and variable edits are undoable and coalesced', () => {
    useSchemaStore.getState().updateCanvas({ background_color: '#111111' });
    vi.advanceTimersByTime(20);
    useSchemaStore.getState().updateCanvas({ background_color: '#222222' });
    useSchemaStore.getState().setVariable('name', 'J');
    vi.advanceTimersByTime(20);
    useSchemaStore.getState().setVariable('name', 'Jo');

    expect(useHistoryStore.getState().past).toHaveLength(2);
    useSchemaStore.getState().undo();
    expect(useSchemaStore.getState().schema.variables).toEqual({});
    expect(useSchemaStore.getState().schema.canvas.background_color).toBe('#222222');
    useSchemaStore.getState().undo();
    expect(useSchemaStore.getState().schema.canvas.background_color).toBe('#ffffff');
  });

  it('removeVariable and renameVariable are undoable', () => {
    useSchemaStore.getState().setVariable('name', 'Jo');
    useSchemaStore.getState().renameVariable('name', 'full_name');
    useSchemaStore.getState().removeVariable('full_name');
    expect(useSchemaStore.getState().schema.variables).toEqual({});

    useSchemaStore.getState().undo();
    expect(useSchemaStore.getState().schema.variables).toEqual({ full_name: 'Jo' });
    useSchemaStore.getState().undo();
    expect(useSchemaStore.getState().schema.variables).toEqual({ name: 'Jo' });
  });

  it('history stays capped at 50 entries', () => {
    for (let i = 0; i < 80; i++) {
      useSchemaStore.getState().updateBlock('a', { content: `v${i}` });
      vi.advanceTimersByTime(HISTORY_COALESCE_MS + 1);
    }
    expect(useHistoryStore.getState().past).toHaveLength(50);
  });
});
