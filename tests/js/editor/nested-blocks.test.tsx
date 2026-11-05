import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { Canvas } from '@/editor/canvas/Canvas';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { ContainerBlock, TextBlock } from '@/core/schema/blocks';
import '@/core/blocks';

const text = (id: string, content: string): TextBlock => ({
  id,
  type: 'text',
  content,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

function renderCanvas() {
  return render(
    <DndContext>
      <Canvas />
    </DndContext>,
  );
}

describe('blocks nested in a container', () => {
  beforeEach(() => {
    const schema = createEmptySchema();
    const cnt: ContainerBlock = {
      id: 'cnt',
      type: 'container',
      columns: 2,
      gap: 16,
      children: [text('l1', 'Left one'), text('l2', 'Left two')],
      right_children: [text('r1', 'Right one')],
    };
    schema.blocks.push(text('top', 'Top block'), cnt);
    useSchemaStore.setState({ schema, hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
    useSelectionStore.setState({ selectedBlockId: null, hoveredBlockId: null });
    endHistoryBurst();
  });

  it('selecting a nested child shows the block toolbar for that child only', () => {
    renderCanvas();
    fireEvent.click(screen.getByText('Left two'));
    expect(useSelectionStore.getState().selectedBlockId).toBe('l2');

    const toolbars = screen.getAllByRole('toolbar');
    expect(toolbars).toHaveLength(1);
    const wrapper = document.querySelector('[data-imgsig-block-id="l2"]');
    expect(wrapper?.contains(toolbars[0]!)).toBe(true);
  });

  it('hovering a nested child hovers the child, not its container', () => {
    renderCanvas();
    fireEvent.mouseOver(screen.getByText('Right one'));
    expect(useSelectionStore.getState().hoveredBlockId).toBe('r1');
  });

  it('move up / down work inside a cell and disable at the ends', () => {
    renderCanvas();
    fireEvent.click(screen.getByText('Left two'));
    const toolbar = screen.getByRole('toolbar');
    expect(within(toolbar).getByLabelText('Move down')).toBeDisabled();

    fireEvent.click(within(toolbar).getByLabelText('Move up'));
    const cnt = useSchemaStore.getState().schema.blocks[1] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['l2', 'l1']);
    expect(within(screen.getByRole('toolbar')).getByLabelText('Move up')).toBeDisabled();
  });

  it('duplicate and delete act on the nested child', () => {
    renderCanvas();
    fireEvent.click(screen.getByText('Right one'));
    fireEvent.click(within(screen.getByRole('toolbar')).getByLabelText('Duplicate'));
    let cnt = useSchemaStore.getState().schema.blocks[1] as ContainerBlock;
    expect(cnt.right_children).toHaveLength(2);

    fireEvent.click(within(screen.getByRole('toolbar')).getByLabelText('Delete'));
    cnt = useSchemaStore.getState().schema.blocks[1] as ContainerBlock;
    expect(cnt.right_children).toHaveLength(1);
    expect(useSchemaStore.getState().schema.blocks.map((b) => b.id)).toEqual(['top', 'cnt']);
  });

  it('top-level toolbar also exposes move up / down', () => {
    renderCanvas();
    fireEvent.click(screen.getByText('Top block'));
    const toolbar = screen.getByRole('toolbar');
    expect(within(toolbar).getByLabelText('Move up')).toBeDisabled();
    fireEvent.click(within(toolbar).getByLabelText('Move down'));
    expect(useSchemaStore.getState().schema.blocks.map((b) => b.id)).toEqual(['cnt', 'top']);
  });
});
