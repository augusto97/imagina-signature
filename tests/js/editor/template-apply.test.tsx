import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TemplatePicker } from '@/editor/modals/TemplatePicker';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useEditorStore } from '@/stores/editorStore';
import { mergeTemplateIntoSchema } from '@/stores/schemaUtils';
import { createEmptySchema, type SignatureSchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';
import '@/core/blocks';

const text = (id: string, content: string): TextBlock => ({
  id,
  type: 'text',
  content,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

function templateSchema(): SignatureSchema {
  const schema = createEmptySchema();
  schema.meta.created_at = '2020-01-01T00:00:00.000Z';
  schema.canvas.background_color = '#fafafa';
  schema.blocks.push(text('tpl_1', '<p>{{name}} — {{title}}</p>'));
  schema.variables = { name: 'Jane Template', title: 'CEO' };
  return schema;
}

function userSchema(): SignatureSchema {
  const schema = createEmptySchema();
  schema.meta.created_at = '2025-05-05T00:00:00.000Z';
  schema.blocks.push(text('mine', '<p>My own design</p>'));
  schema.variables = { name: 'Carlos', phone: '+57 300' };
  return schema;
}

describe('mergeTemplateIntoSchema', () => {
  it('keeps user values for shared keys, adds template keys, keeps other user keys', () => {
    const merged = mergeTemplateIntoSchema(userSchema(), templateSchema());
    expect(merged.variables).toEqual({ name: 'Carlos', title: 'CEO', phone: '+57 300' });
    expect(merged.blocks.map((b) => b.id)).toEqual(['tpl_1']);
    expect(merged.canvas.background_color).toBe('#fafafa');
    expect(merged.meta.created_at).toBe('2025-05-05T00:00:00.000Z');
  });

  it('does not mutate its inputs', () => {
    const tpl = templateSchema();
    const before = JSON.stringify(tpl);
    mergeTemplateIntoSchema(userSchema(), tpl);
    expect(JSON.stringify(tpl)).toBe(before);
  });
});

describe('replaceSchema', () => {
  beforeEach(() => {
    useSchemaStore.setState({ schema: userSchema(), hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
    endHistoryBurst();
  });

  it('undoable replace pushes the previous schema so undo restores it', () => {
    useSchemaStore.getState().replaceSchema(templateSchema(), { undoable: true });
    expect(useSchemaStore.getState().schema.blocks[0]?.id).toBe('tpl_1');
    expect(useSchemaStore.getState().hasUserEdited).toBe(true);

    useSchemaStore.getState().undo();
    expect(useSchemaStore.getState().schema.blocks[0]?.id).toBe('mine');
    expect(useSchemaStore.getState().schema.variables.name).toBe('Carlos');
  });

  it('non-undoable replace clears history', () => {
    useSchemaStore.getState().addBlock(text('x', 'x'));
    useSchemaStore.getState().replaceSchema(templateSchema(), { undoable: false });
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });
});

describe('TemplatePicker apply flow', () => {
  beforeEach(() => {
    useSchemaStore.setState({ schema: userSchema(), hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
    useEditorStore.setState({ modal: 'template-picker' });
    endHistoryBurst();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              id: 7,
              slug: 'corp',
              name: 'Corporate',
              description: 'Desc',
              category: 'business',
              preview_url: null,
              json_content: templateSchema(),
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useEditorStore.setState({ modal: null });
  });

  it('asks for confirmation on a non-empty canvas, then applies undoably', async () => {
    render(<TemplatePicker />);
    const card = await screen.findByText('Corporate');
    // Thumbnail rendered from the compiled template.
    expect(document.querySelector('iframe[sandbox]')).not.toBeNull();

    fireEvent.click(card);
    // Nothing applied yet — a confirm dialog is showing.
    expect(useSchemaStore.getState().schema.blocks[0]?.id).toBe('mine');
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toBeInTheDocument();

    fireEvent.click(screen.getByText('Apply template'));
    await waitFor(() => expect(useSchemaStore.getState().schema.blocks[0]?.id).toBe('tpl_1'));
    expect(useSchemaStore.getState().schema.variables).toEqual({
      name: 'Carlos',
      title: 'CEO',
      phone: '+57 300',
    });
    expect(useEditorStore.getState().modal).toBeNull();

    act(() => {
      useSchemaStore.getState().undo();
    });
    expect(useSchemaStore.getState().schema.blocks[0]?.id).toBe('mine');
  });

  it('cancel keeps the current design and Escape only closes the dialog', async () => {
    render(<TemplatePicker />);
    fireEvent.click(await screen.findByText('Corporate'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // The picker itself is still open.
    expect(useEditorStore.getState().modal).toBe('template-picker');
    expect(useSchemaStore.getState().schema.blocks[0]?.id).toBe('mine');
  });

  it('applies straight away on an empty canvas', async () => {
    useSchemaStore.setState({ schema: createEmptySchema(), hasUserEdited: false });
    render(<TemplatePicker />);
    fireEvent.click(await screen.findByText('Corporate'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useSchemaStore.getState().schema.blocks[0]?.id).toBe('tpl_1');
  });
});
