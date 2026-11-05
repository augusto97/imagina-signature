import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import type { FC } from 'react';
import { Canvas } from '@/editor/canvas/Canvas';
import { BlockRenderer } from '@/editor/canvas/BlockRenderer';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useCanvasDataStore } from '@/stores/canvasDataStore';
import { createEmptySchema } from '@/core/schema/signature';
import { compileSignature } from '@/core/compiler/compile';
import { registerBlock } from '@/core/blocks/registry';
import type { Block, HeadingBlock, ImageBlock } from '@/core/schema/blocks';
import { container, text } from '../fixtures/containers';
import '@/core/blocks';

const config = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
  .IMGSIG_EDITOR_CONFIG;

const heading = (id: string, content: string): HeadingBlock => ({
  id,
  type: 'heading',
  content,
  style: { font_family: 'Arial', font_size: 18, font_weight: 700, color: '#111' },
});

function seed(blocks: Block[], variables: Record<string, string> = {}): void {
  const schema = createEmptySchema();
  schema.blocks.push(...blocks);
  schema.variables = variables;
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

beforeEach(() => {
  config.systemVariables = {
    wp_first_name: 'Jane',
    company_name: 'Acme & Sons',
    company_logo: '',
    company_website: 'https://acme.example',
  };
  useCanvasDataStore.setState({ showData: true });
});

afterEach(() => {
  delete config.systemVariables;
});

describe('canvas: Show data / Show fields', () => {
  it('shows resolved values (system, company and own variables) in data mode', () => {
    seed(
      [
        heading('h', '{{wp_first_name}} · {{title}} · {{missing}}'),
        text('t', '<p>{{company_name}}</p>'),
      ],
      { title: 'CTO' },
    );
    renderCanvas();

    expect(screen.getByText('Jane · CTO · {{missing}}')).toBeInTheDocument();
    expect(screen.getByText('Acme & Sons')).toBeInTheDocument();
  });

  it('shows the raw tokens in fields mode and switches live', () => {
    seed([heading('h', 'Hi {{wp_first_name}}')]);
    useCanvasDataStore.setState({ showData: false });
    renderCanvas();

    expect(screen.getByText('Hi {{wp_first_name}}')).toBeInTheDocument();
    act(() => useCanvasDataStore.getState().setShowData(true));
    expect(screen.getByText('Hi Jane')).toBeInTheDocument();
  });

  it('resolves blocks nested in containers once, without touching the store or the export', () => {
    seed([container('row', [[heading('n', '{{company_name}}')], [text('t2', '<p>x</p>')]])]);
    const before = structuredClone(useSchemaStore.getState().schema);
    const exportBefore = compileSignature(before).html;
    renderCanvas();

    expect(screen.getByText('Acme & Sons')).toBeInTheDocument();
    const after = useSchemaStore.getState().schema;
    expect(after).toEqual(before);
    expect(compileSignature(after).html).toBe(exportBefore);
    expect(useSchemaStore.getState().hasUserEdited).toBe(false);
  });

  it('renders an image whose URL token resolves to empty without crashing', () => {
    const img: ImageBlock = {
      id: 'logo',
      type: 'image',
      src: '{{company_logo}}',
      alt: '{{company_name}}',
      link: '{{company_website}}',
      width: 120,
    };
    seed([img]);
    renderCanvas();

    const el = screen.getByAltText('Acme & Sons') as HTMLImageElement;
    expect(el.getAttribute('src')).toContain('placehold.co');
    expect(el.closest('a')?.getAttribute('href')).toBe('https://acme.example');
  });

  it('falls back to the raw block when a renderer throws on resolved data', () => {
    const Fragile: FC<{ block: HeadingBlock }> = ({ block }) => {
      if (block.content === '') throw new Error('empty');
      return <span>{block.content}</span>;
    };
    registerBlock({
      type: 'test_fragile',
      label: 'Fragile',
      description: '',
      icon: (() => null) as never,
      category: 'content',
      create: () => heading('f', ''),
      Renderer: Fragile as never,
      PropertiesPanel: (() => null) as never,
      compile: () => '',
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fragile = { ...heading('f', '{{company_logo}}'), type: 'test_fragile' } as unknown as Block;

    render(<BlockRenderer block={fragile} />);

    expect(screen.getByText('{{company_logo}}')).toBeInTheDocument();
    spy.mockRestore();
  });
});
