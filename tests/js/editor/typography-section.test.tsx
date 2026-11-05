import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type FC } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { TypographySection } from '@/editor/sidebar-right/inputs/TypographySection';
import { RightSidebar } from '@/editor/sidebar-right/RightSidebar';
import type { TextStyle } from '@/core/schema/styles';
import type { HeadingBlock } from '@/core/schema/blocks';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useHistoryStore } from '@/stores/historyStore';
import { createEmptySchema } from '@/core/schema/signature';
import '@/core/blocks';

const inherited = {
  font_family: 'Georgia, serif',
  font_size: 14,
  font_weight: 400 as const,
  color: '#222222',
  line_height: 1.4,
};

type Hide = Parameters<typeof TypographySection>[0]['hide'];

/** Stateful host so the controlled inputs see their own updates. */
const Harness: FC<{ initial: TextStyle; hide?: Hide; spy: (next: TextStyle) => void }> = ({
  initial,
  hide,
  spy,
}) => {
  const [value, setValue] = useState<TextStyle>(initial);
  return (
    <TypographySection
      value={value}
      onChange={(next) => {
        spy(next);
        setValue(next);
      }}
      inherited={inherited}
      hide={hide}
    />
  );
};

function setup(value: TextStyle = {}, hide?: Hide) {
  const onChange = vi.fn<(next: TextStyle) => void>();
  render(<Harness initial={value} hide={hide} spy={onChange} />);
  return onChange;
}

const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)![0] as TextStyle;

describe('TypographySection', () => {
  it('offers "Canvas default" and clears the family with it', () => {
    const onChange = setup({ font_family: 'Arial, sans-serif', color: '#111111' });
    // First select = font family (the second is the weight).
    const select = screen.getAllByRole('combobox')[0]!;
    expect(
      within(select).getByRole('option', { name: 'Canvas default (Georgia)' }),
    ).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '__canvas__' } });
    expect(last(onChange)).toEqual({ color: '#111111' });
    expect('font_family' in last(onChange)).toBe(false);

    fireEvent.change(select, { target: { value: 'Verdana, Geneva, sans-serif' } });
    expect(last(onChange)).toEqual({
      color: '#111111',
      font_family: 'Verdana, Geneva, sans-serif',
    });
  });

  it('shows inherited size as a placeholder and writes / clears an override', () => {
    const onChange = setup({});
    const size = screen.getByPlaceholderText('14') as HTMLInputElement;
    expect(size.value).toBe('');
    fireEvent.change(size, { target: { value: '18' } });
    expect(last(onChange)).toEqual({ font_size: 18 });
    fireEvent.change(size, { target: { value: '' } });
    expect(last(onChange)).toEqual({});
  });

  it('clamps letter spacing to −1…6 px and drops 0', () => {
    const onChange = setup({});
    const spacing = screen.getByPlaceholderText('0');
    fireEvent.change(spacing, { target: { value: '9' } });
    expect(last(onChange)).toEqual({ letter_spacing: 6 });
    fireEvent.change(spacing, { target: { value: '-4' } });
    expect(last(onChange)).toEqual({ letter_spacing: -1 });
    fireEvent.change(spacing, { target: { value: '0' } });
    expect(last(onChange)).toEqual({});
  });

  it('sets line height, case, italic and alignment', () => {
    const onChange = setup({});
    fireEvent.change(screen.getByPlaceholderText('1.4'), { target: { value: '1.6' } });
    expect(last(onChange)).toEqual({ line_height: 1.6 });

    fireEvent.click(screen.getByRole('radio', { name: 'Uppercase' }));
    expect(last(onChange)).toEqual({ line_height: 1.6, text_transform: 'uppercase' });

    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect(last(onChange)).toMatchObject({ font_style: 'italic' });

    fireEvent.click(screen.getByRole('radio', { name: 'Align center' }));
    expect(last(onChange)).toEqual({
      line_height: 1.6,
      text_transform: 'uppercase',
      font_style: 'italic',
      text_align: 'center',
    });
  });

  it('weight falls back to the inherited weight and is stored when changed', () => {
    const onChange = setup({});
    const weight = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    expect(weight.value).toBe('400');
    fireEvent.change(weight, { target: { value: '700' } });
    expect(last(onChange)).toEqual({ font_weight: 700 });
  });

  it('turns italic / case back off by removing the field', () => {
    const onChange = setup({ font_style: 'italic', text_transform: 'capitalize' });
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect(last(onChange)).toEqual({ text_transform: 'capitalize' });
    fireEvent.click(screen.getByRole('radio', { name: 'No case change' }));
    expect(last(onChange)).toEqual({});
  });

  it('resets an explicit colour to the canvas colour', () => {
    const onChange = setup({ color: '#ff0000' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Use canvas default' }).at(-1)!);
    expect(last(onChange)).toEqual({});
  });

  it('hides the requested fields (button: colour / line height / alignment)', () => {
    setup({}, ['color', 'line_height', 'text_align']);
    expect(screen.queryByText('Color')).toBeNull();
    expect(screen.queryByPlaceholderText('1.4')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Align center' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Uppercase' })).toBeInTheDocument();
  });
});

describe('Heading panel on a legacy (plain-text) heading', () => {
  beforeEach(() => {
    const schema = createEmptySchema();
    const legacy: HeadingBlock = {
      id: 'h',
      type: 'heading',
      content: 'Smith & Sons',
      style: {
        font_family: 'Arial, sans-serif',
        font_size: 18,
        font_weight: 700,
        color: '#111827',
      },
    };
    schema.blocks.push(legacy);
    useSchemaStore.setState({ schema, hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
    useSelectionStore.setState({ selectedBlockId: 'h', hoveredBlockId: null });
    endHistoryBurst();
  });

  it('opens the escaped text in the rich editor without writing anything', () => {
    const { container } = render(<RightSidebar />);
    const pm = container.querySelector('.ProseMirror')!;
    expect(pm.textContent).toBe('Smith & Sons');
    expect(useSchemaStore.getState().hasUserEdited).toBe(false);
    const block = useSchemaStore.getState().schema.blocks[0] as HeadingBlock;
    expect(block.content_html).toBeUndefined();
  });

  it('explains where to add fields when there are none', () => {
    render(<RightSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert field' }));
    expect(screen.getByText(/No fields yet/)).toBeInTheDocument();
  });

  it('writes content_html + the plain mirror on the first edit', () => {
    const cfg = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
      .IMGSIG_EDITOR_CONFIG;
    cfg.systemVariables = { wp_last_name: 'Smith' };
    try {
      render(<RightSidebar />);
      fireEvent.click(screen.getByRole('button', { name: 'Insert field' }));
      act(() => {
        fireEvent.click(screen.getByText('{{wp_last_name}}'));
      });
      const block = useSchemaStore.getState().schema.blocks[0] as HeadingBlock;
      // Single paragraph; the token lands at the caret (start: never focused).
      expect(block.content_html).toBe('<p>{{wp_last_name}}Smith &amp; Sons</p>');
      expect(block.content).toMatch(/Smith & Sons/);
      expect(block.content).toContain('{{wp_last_name}}');
      expect(useSchemaStore.getState().hasUserEdited).toBe(true);
    } finally {
      delete cfg.systemVariables;
    }
  });
});
