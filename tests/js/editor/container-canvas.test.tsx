import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { Canvas } from '@/editor/canvas/Canvas';
import { PropertyPanel } from '@/editor/sidebar-right/PropertyPanel';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useDeviceStore } from '@/stores/deviceStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, ContainerBlock } from '@/core/schema/blocks';
import { container, text } from '../fixtures/containers';
import '@/core/blocks';

function seed(...blocks: Block[]): void {
  const schema = createEmptySchema();
  schema.blocks.push(...blocks);
  useSchemaStore.setState({ schema, hasUserEdited: false });
  useHistoryStore.setState({ past: [], future: [] });
  useSelectionStore.setState({ selectedBlockId: null, hoveredBlockId: null });
  endHistoryBurst();
}

const renderCanvas = () =>
  render(
    <DndContext>
      <Canvas />
    </DndContext>,
  );

const row = (): ContainerBlock => useSchemaStore.getState().schema.blocks[0] as ContainerBlock;

describe('canvas: container v2', () => {
  beforeEach(() => {
    useDeviceStore.setState({ device: 'desktop' });
    seed(
      container('cnt', [[text('a', 'Photo')], [text('b', 'Details')], [], [text('d', 'QR')]], {
        widths: [25, 25, 25, 25],
        divider: { width: 2, style: 'solid', color: '#2563eb' },
      }),
    );
  });

  it('renders one cell per column side by side, with the divider on columns 2..N', () => {
    renderCanvas();
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-imgsig-column]'));
    expect(cells).toHaveLength(4);
    expect(cells[0]!.closest('tr')).toBe(cells[3]!.closest('tr'));
    expect(cells[0]!.style.width).toBe('25%');
    expect(cells[0]!.style.borderLeft).toBe('');
    expect(cells[1]!.style.borderLeft).toContain('2px solid');
    // The empty column still offers a drop target.
    expect(screen.getByText('Drop blocks here')).toBeInTheDocument();
  });

  it('stacks the columns in the mobile preview when stack_on_mobile is on', () => {
    useSchemaStore.getState().updateBlock('cnt', { stack_on_mobile: true });
    useDeviceStore.setState({ device: 'mobile' });
    renderCanvas();
    expect(document.querySelector('[data-imgsig-stacked]')).not.toBeNull();
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-imgsig-column]'));
    const rows = new Set(cells.map((c) => c.closest('tr')));
    expect(rows.size).toBe(4);
    expect(cells[0]!.style.width).toBe('');
  });

  it('keeps columns side by side on mobile when stacking is off', () => {
    useDeviceStore.setState({ device: 'mobile' });
    renderCanvas();
    expect(document.querySelector('[data-imgsig-stacked]')).toBeNull();
  });

  it('wraps a block with a box in the same table the compiler emits', () => {
    useSchemaStore.getState().updateBlock('b', {
      box: {
        background_color: '#fef3c7',
        border_radius: 12,
        padding: { top: 4, right: 8, bottom: 4, left: 8 },
      },
    });
    renderCanvas();
    const frame = document.querySelector<HTMLElement>(
      '[data-imgsig-block-id="b"] [data-imgsig-box]',
    )!;
    expect(frame).not.toBeNull();
    const td = frame.querySelector('td')!;
    expect(td.style.backgroundColor).toBe('rgb(254, 243, 199)');
    expect(td.style.borderRadius).toBe('12px');
    expect(td.style.paddingTop).toBe('4px');
    expect(td.style.paddingLeft).toBe('8px');
    expect(td.textContent).toContain('Details');
  });
});

describe('container property panel', () => {
  beforeEach(() => {
    useDeviceStore.setState({ device: 'desktop' });
    seed(container('cnt', [[text('a', 'Left')], [text('b', 'Right')]]));
  });

  it('per-column panel edits valign and the column box', () => {
    render(<PropertyPanel block={row()} />);
    fireEvent.click(screen.getByText('Column 2'));
    fireEvent.click(screen.getByRole('radio', { name: 'Middle' }));
    expect(row().columns[1]!.valign).toBe('middle');
    fireEvent.click(screen.getByRole('button', { name: 'Add background' }));
    expect(row().columns[1]!.box).toEqual({ background_color: '#f3f4f6' });
    // The container's own (block-level) Box section is still there.
    expect(screen.getByRole('button', { name: /^Box$/i })).toBeInTheDocument();
  });

  it('container panel: presets change the column count without losing blocks', () => {
    render(<PropertyPanel block={row()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Layout 25 / 25 / 25 / 25' }));
    expect(row().columns.map((c) => c.width)).toEqual([25, 25, 25, 25]);

    fireEvent.click(screen.getByRole('radio', { name: '1 column' }));
    expect(row().columns).toHaveLength(1);
    expect(row().columns[0]!.children.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('container panel: divider and stack toggles update the block', () => {
    render(<PropertyPanel block={row()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Divider between columns' }));
    expect(row().divider).toMatchObject({ width: 1, style: 'solid' });
    fireEvent.click(screen.getByRole('switch', { name: 'Stack columns on mobile' }));
    expect(row().stack_on_mobile).toBe(true);
  });
});
