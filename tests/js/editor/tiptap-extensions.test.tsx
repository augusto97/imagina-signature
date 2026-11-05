import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { FontSize } from '@/tiptap/extensions/FontSize';
import { SingleParagraphDocument } from '@/tiptap/extensions/SingleParagraphDocument';
import { VARIABLE_CHIP_CLASS, VariableChips } from '@/tiptap/extensions/VariableChips';
import { TiptapEditor } from '@/tiptap/TiptapEditor';
import { toHex } from '@/tiptap/toolbar/colors';
import { sanitizeEmailHtml } from '@/core/compiler/sanitize';
import { useSchemaStore } from '@/stores/schemaStore';
import { createEmptySchema } from '@/core/schema/signature';

const editors: Editor[] = [];
function editorWith(content: string, extra: ConstructorParameters<typeof Editor>[0] = {}): Editor {
  const editor = new Editor({
    extensions: [StarterKit, TextStyle, Color, FontSize, VariableChips],
    content,
    ...extra,
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

type Config = { systemVariables?: Record<string, string>; brandPalette?: string[] };
const config = () =>
  (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Config }).IMGSIG_EDITOR_CONFIG;

describe('VariableChips decoration', () => {
  it('shows {{tokens}} as chips without changing the stored HTML', () => {
    const editor = editorWith('<p>Hi {{wp_first_name}}, call {{ phone }}</p>');
    const chips = editor.view.dom.querySelectorAll(`.${VARIABLE_CHIP_CLASS}`);
    expect(Array.from(chips).map((c) => c.textContent)).toEqual([
      '{{wp_first_name}}',
      '{{ phone }}',
    ]);
    expect(chips[0]!.getAttribute('data-variable')).toBe('wp_first_name');
    expect(editor.getHTML()).toBe('<p>Hi {{wp_first_name}}, call {{ phone }}</p>');
    expect(editor.getHTML()).not.toContain(VARIABLE_CHIP_CLASS);
  });

  it('matches tokens split across marks and after hard breaks', () => {
    const editor = editorWith('<p>a<br>{{na<strong>me</strong>}} b</p>');
    const chips = editor.view.dom.querySelectorAll('[data-variable="name"]');
    expect(chips.length).toBeGreaterThan(0);
    expect(
      Array.from(chips)
        .map((c) => c.textContent)
        .join(''),
    ).toBe('{{name}}');
  });

  it('updates as the document changes', () => {
    const editor = editorWith('<p>Hello</p>');
    expect(editor.view.dom.querySelectorAll(`.${VARIABLE_CHIP_CLASS}`)).toHaveLength(0);
    editor.commands.insertContent(' {{company}}');
    expect(editor.view.dom.querySelectorAll(`.${VARIABLE_CHIP_CLASS}`)).toHaveLength(1);
  });
});

describe('colour + font-size marks', () => {
  it('round-trips colour and px font size through the email sanitiser', () => {
    const editor = editorWith('<p><span style="color: #ff0000; font-size: 18px">Red</span></p>');
    const html = editor.getHTML();
    expect(html).toMatch(/font-size: 18px/);
    expect(sanitizeEmailHtml(html)).toBe(
      '<p style="margin:0"><span style="color:#ff0000;font-size:18px">Red</span></p>',
    );
  });

  it('applies and removes a font size on the selection', () => {
    const editor = editorWith('<p>Hello</p>');
    editor.chain().selectAll().setFontSize('20px').run();
    expect(editor.getHTML()).toMatch(/^<p><span style="font-size: 20px;?">Hello<\/span><\/p>$/);
    expect(editor.commands.setFontSize('2em')).toBe(false);
    editor.chain().selectAll().unsetFontSize().run();
    expect(editor.getHTML()).toBe('<p>Hello</p>');
  });

  it('ignores non-px sizes and keeps letter-spacing / text-transform', () => {
    const editor = editorWith(
      '<p><span style="font-size: 2em">a</span> <span style="letter-spacing: 2px; text-transform: uppercase">b</span></p>',
    );
    const html = editor.getHTML();
    expect(html).not.toContain('2em');
    expect(html).toContain('letter-spacing: 2px');
    expect(html).toContain('text-transform: uppercase');
  });

  it('toHex normalises the rgb() colours Tiptap reads back', () => {
    expect(toHex('rgb(37, 99, 235)')).toBe('#2563eb');
    expect(toHex('#ABC')).toBe('#aabbcc');
    expect(toHex('rgba(0, 0, 0, 0.5)')).toBeNull();
    expect(toHex(undefined)).toBeNull();
  });
});

describe('SingleParagraphDocument', () => {
  it('keeps headings to one paragraph (Enter cannot split it)', () => {
    const editor = editorWith('<p>One</p><p>Two</p>', {
      extensions: [StarterKit.configure({ document: false }), SingleParagraphDocument],
    });
    expect(editor.getJSON().content).toHaveLength(1);
    editor.commands.focus('end');
    expect(editor.commands.splitBlock()).toBe(false);
    expect(editor.getJSON().content).toHaveLength(1);
    expect(editor.commands.setHardBreak()).toBe(true);
    expect(editor.getHTML()).toMatch(/^<p>.*<br>.*<\/p>$/);
  });
});

describe('TiptapEditor toolbar', () => {
  afterEach(() => {
    delete config().systemVariables;
    delete config().brandPalette;
  });

  it('inserts a field from the profile and signature variables', () => {
    config().systemVariables = { wp_display_name: 'Jane Doe', wp_email: 'jane@acme.example' };
    const schema = createEmptySchema();
    schema.variables = { phone: '+1 555 0100' };
    useSchemaStore.setState({ schema, hasUserEdited: false });

    const onChange = vi.fn();
    render(<TiptapEditor content="<p>Hi </p>" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert field' }));
    expect(screen.getByText('{{wp_email}}')).toBeInTheDocument();
    expect(screen.getByText('{{phone}}')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText('{{wp_display_name}}'));
    });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)![0]).toContain('{{wp_display_name}}');
  });

  it('offers the brand palette in the colour menu', () => {
    config().brandPalette = ['#0f766e', '#f59e0b'];
    render(<TiptapEditor content="<p>Hi</p>" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    expect(screen.getByText('Brand palette')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#0f766e' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#f59e0b' })).toBeInTheDocument();
  });

  it('applies a colour and a size to the selection', () => {
    const onChange = vi.fn();
    const { container } = render(<TiptapEditor content="<p>Hello</p>" onChange={onChange} />);
    expect(container.querySelector('.ProseMirror')).not.toBeNull();

    // Select everything through the toolbar-independent keyboard path.
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    pm.focus();
    fireEvent.keyDown(pm, { key: 'a', ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '#dc2626' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Font size' }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '18' }));
    });
    const html = onChange.mock.calls.at(-1)?.[0] as string | undefined;
    expect(html).toBeDefined();
    expect(sanitizeEmailHtml(html!)).toMatch(/<span style="color:#dc2626;font-size:18px">/);
  });

  it('leaves formats out of the schema when not allowed (disclaimer)', () => {
    const onChange = vi.fn();
    render(
      <TiptapEditor
        content='<p><u>under</u> <span style="color: #ff0000">red</span> <strong>bold</strong></p>'
        onChange={onChange}
        allowedFormats={['bold', 'italic', 'link']}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Underline' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Text color' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Font size' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
  });
});
