import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { Canvas } from '@/editor/canvas/Canvas';
import { PropertyPanel } from '@/editor/sidebar-right/PropertyPanel';
import { BoxStyleSection } from '@/editor/sidebar-right/sections/BoxStyleSection';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, TextBlock } from '@/core/schema/blocks';
import '@/core/blocks';

const text = (id: string, content: string): TextBlock => ({
  id,
  type: 'text',
  content,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

function seed(...blocks: Block[]): void {
  const schema = createEmptySchema();
  schema.blocks.push(...blocks);
  useSchemaStore.setState({ schema, hasUserEdited: false });
  useHistoryStore.setState({ past: [], future: [] });
  useSelectionStore.setState({ selectedBlockId: null, hoveredBlockId: null });
  endHistoryBurst();
}

const first = (): Block => useSchemaStore.getState().schema.blocks[0]!;

describe('canvas BoxFrame', () => {
  beforeEach(() => seed(text('t', 'Boxed words')));

  it('renders nothing extra without a box', () => {
    render(
      <DndContext>
        <Canvas />
      </DndContext>,
    );
    expect(document.querySelector('[data-imgsig-box]')).toBeNull();
  });

  it('wraps the block in the same styled cell the compiler emits', () => {
    useSchemaStore.getState().updateBlock('t', {
      box: {
        background_color: '#eef2ff',
        border: { width: 2, style: 'solid', color: '#2563eb' },
        border_radius: 6,
        align: 'center',
        width: 240,
      },
    });
    render(
      <DndContext>
        <Canvas />
      </DndContext>,
    );
    const table = document.querySelector<HTMLTableElement>('[data-imgsig-box]')!;
    expect(table.getAttribute('width')).toBe('240');
    expect(table.getAttribute('align')).toBe('center');
    const td = table.querySelector('td')!;
    expect(td.getAttribute('align')).toBe('center');
    expect(td.style.backgroundColor).toBe('rgb(238, 242, 255)');
    expect(td.style.border).toContain('2px solid');
    expect(td.style.borderRadius).toBe('6px');
    expect(td.textContent).toContain('Boxed words');
  });
});

describe('Box section', () => {
  beforeEach(() => seed(text('t', 'Solo')));

  it('is appended to the property panel of every block and writes block.box', () => {
    render(<PropertyPanel block={first()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Box$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add background' }));
    expect(first().box).toEqual({ background_color: '#f3f4f6' });

    fireEvent.click(screen.getByRole('radio', { name: 'All sides' }));
    expect(first().box?.border).toMatchObject({ width: 1, style: 'solid' });
  });

  it('per-side mode seeds four sides from the uniform border; reset clears the box', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BoxStyleSection
        bare
        value={{ border: { width: 3, style: 'dashed', color: '#111111' } }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Per side' }));
    const next = onChange.mock.calls[0]![0];
    expect(next.border).toBeUndefined();
    for (const key of ['border_top', 'border_right', 'border_bottom', 'border_left']) {
      expect(next[key]).toEqual({ width: 3, style: 'dashed', color: '#111111' });
    }

    rerender(<BoxStyleSection bare value={next} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset box styling' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('column variant hides the fixed width option', () => {
    render(<BoxStyleSection bare variant="column" value={undefined} onChange={() => {}} />);
    expect(screen.queryByRole('switch', { name: 'Fixed width' })).toBeNull();
    expect(screen.getByText('Content alignment')).toBeInTheDocument();
  });
});
