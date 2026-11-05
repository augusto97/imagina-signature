import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PreviewModal } from '@/editor/modals/PreviewModal';
import { useEditorStore } from '@/stores/editorStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import '@/core/blocks';

const text = (id: string, color = '#111111'): Block => ({
  id,
  type: 'text',
  content: 'Jane Doe',
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color },
});

function setBlocks(blocks: Block[]): void {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  useSchemaStore.setState({ schema });
}

afterEach(() => {
  useEditorStore.setState({ modal: null });
});

describe('Preview → issues', () => {
  it('lists issues beside the preview; clicking one selects its block and closes the modal', () => {
    setBlocks([text('faint', '#dddddd')]);
    useSelectionStore.setState({ selectedBlockId: null });
    useEditorStore.setState({ modal: 'preview' });
    render(<PreviewModal />);

    expect(screen.getByTitle('Signature preview')).toBeInTheDocument();
    const issue = screen.getByRole('button', { name: /low contrast/ });
    fireEvent.click(issue);
    expect(useSelectionStore.getState().selectedBlockId).toBe('faint');
    expect(useEditorStore.getState().modal).toBeNull();
  });

  it('labels the dark mode switch as a simulation and feeds the transforms into the iframe', () => {
    setBlocks([text('t')]);
    useEditorStore.setState({ modal: 'preview' });
    render(<PreviewModal />);

    const select = screen.getByLabelText('Dark mode (simulation)') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'full' } });
    const iframe = screen.getByTitle('Signature preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toContain('filter:invert(1) hue-rotate(180deg)');

    fireEvent.click(screen.getByRole('tab', { name: 'Outlook for Windows' }));
    expect(iframe.getAttribute('srcdoc')).toContain('data-imgsig-preview="outlook"');

    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(screen.getByRole('tab', { name: 'Outlook app' })).toBeInTheDocument();
    expect(iframe.style.width).toBe('360px');
  });
});
