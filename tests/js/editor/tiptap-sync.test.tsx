import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TiptapEditor } from '@/tiptap/TiptapEditor';
import { RightSidebar } from '@/editor/sidebar-right/RightSidebar';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useHistoryStore } from '@/stores/historyStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';
import '@/core/blocks';

const text = (id: string, content: string): TextBlock => ({
  id,
  type: 'text',
  content,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

function editorElement(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.ProseMirror');
  if (!el) throw new Error('Tiptap editor not rendered');
  return el as HTMLElement;
}

describe('TiptapEditor external content sync', () => {
  it('reflects a new content prop without emitting onChange', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <TiptapEditor content="<p>Alpha</p>" onChange={onChange} />,
    );
    expect(editorElement(container).textContent).toBe('Alpha');

    rerender(<TiptapEditor content="<p>Beta</p>" onChange={onChange} />);
    expect(editorElement(container).textContent).toBe('Beta');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not re-sync a non-normalised prop on every render', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<TiptapEditor content="Plain" onChange={onChange} />);
    rerender(<TiptapEditor content="Plain" onChange={onChange} />);
    expect(editorElement(container).textContent).toBe('Plain');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('RightSidebar + Tiptap across selection changes and undo', () => {
  beforeEach(() => {
    const schema = createEmptySchema();
    schema.blocks.push(text('a', '<p>Block A</p>'), text('b', '<p>Block B</p>'));
    useSchemaStore.setState({ schema, hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
    useSelectionStore.setState({ selectedBlockId: 'a', hoveredBlockId: null });
    endHistoryBurst();
  });

  it('shows the newly selected text block content (no stale editor)', () => {
    const { container } = render(<RightSidebar />);
    expect(editorElement(container).textContent).toBe('Block A');

    act(() => useSelectionStore.getState().select('b'));
    expect(editorElement(container).textContent).toBe('Block B');

    // Nothing was written as a side effect of switching.
    const blocks = useSchemaStore.getState().schema.blocks as TextBlock[];
    expect(blocks.map((b) => b.content)).toEqual(['<p>Block A</p>', '<p>Block B</p>']);
    expect(useSchemaStore.getState().hasUserEdited).toBe(false);
  });

  it('updates the open editor when undo changes the selected block', () => {
    const { container } = render(<RightSidebar />);
    act(() => useSchemaStore.getState().updateBlock('a', { content: '<p>Edited</p>' }));
    expect(editorElement(container).textContent).toBe('Edited');

    act(() => {
      useSchemaStore.getState().undo();
    });
    expect(editorElement(container).textContent).toBe('Block A');
    expect(screen.getAllByText('Block A').length).toBeGreaterThan(0);
  });
});
