import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema, type CanvasConfig } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import type { TextStyle } from '@/core/schema/styles';
import { getBlockDefinition } from '@/core/blocks/registry';
import {
  DISCLAIMER_TYPOGRAPHY,
  HEADING_TYPOGRAPHY,
  TEXT_TYPOGRAPHY,
  inheritedTypography,
  mutedColor,
  resolveTypography,
  withStyleField,
} from '@/core/blocks/text/typography';
import '@/core/blocks';

/**
 * Typography v1.2: canvas inheritance for unset family / size / colour,
 * the new style fields (letter spacing, case, italic, alignment) and the
 * Outlook-friendly px line height.
 */

function compile(blocks: Block[], canvas: Partial<CanvasConfig> = {}) {
  const schema = createEmptySchema();
  Object.assign(schema.canvas, canvas);
  schema.blocks = blocks;
  return compileSignature(schema);
}

/** Style declarations of the first element matching `selector`, as a map. */
function declarations(html: string, selector: string): Record<string, string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.querySelector(selector);
  expect(el, selector).not.toBeNull();
  const out: Record<string, string> = {};
  for (const decl of (el!.getAttribute('style') ?? '').split(';')) {
    const idx = decl.indexOf(':');
    if (idx > 0) out[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
  }
  return out;
}

/** The cell a text-like block compiles to (the td holding its content). */
const cellOf = (html: string, text: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const td = Array.from(doc.querySelectorAll('td')).find(
    (cell) => cell.textContent?.trim() === text && cell.querySelector('td') === null,
  );
  expect(td, `cell "${text}"`).toBeDefined();
  const out: Record<string, string> = {};
  for (const decl of (td!.getAttribute('style') ?? '').split(';')) {
    const idx = decl.indexOf(':');
    if (idx > 0) out[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
  }
  return out;
};

const text = (content: string, style: TextStyle = {}): Block => ({
  id: `t-${content}`,
  type: 'text',
  content,
  style,
});

describe('canvas inheritance', () => {
  const canvas = {
    font_family: '"Trebuchet MS", sans-serif',
    font_size: 16,
    text_color: '#334155',
    background_color: '#ffffff',
  };

  it('compiles an unset family / size / colour with the canvas defaults', () => {
    const { html } = compile([text('Inherited')], canvas);
    const style = cellOf(html, 'Inherited');
    expect(style['font-family']).toBe("'Trebuchet MS', sans-serif");
    expect(style['font-size']).toBe('16px');
    expect(style.color).toBe('#334155');
    expect(style['font-weight']).toBe('400');
  });

  it('keeps explicit (pre-1.2) values over the canvas', () => {
    const { html } = compile(
      [
        text('Explicit', {
          font_family: 'Georgia, serif',
          font_size: 12,
          font_weight: 700,
          color: '#ff0000',
        }),
      ],
      canvas,
    );
    const style = cellOf(html, 'Explicit');
    expect(style['font-family']).toBe('Georgia, serif');
    expect(style['font-size']).toBe('12px');
    expect(style['font-weight']).toBe('700');
    expect(style.color).toBe('#ff0000');
  });

  it('scales inherited heading / disclaimer sizes from the canvas size', () => {
    const blocks: Block[] = [
      { id: 'h', type: 'heading', content: 'Jane Doe', style: {} },
      { id: 'd', type: 'disclaimer', content: 'Small print', style: {} },
    ];
    let html = compile(blocks).html; // canvas 14px
    expect(cellOf(html, 'Jane Doe')['font-size']).toBe('18px');
    expect(cellOf(html, 'Jane Doe')['font-weight']).toBe('700');
    expect(cellOf(html, 'Small print')['font-size']).toBe('10px');
    html = compile(blocks, { font_size: 21 }).html;
    expect(cellOf(html, 'Jane Doe')['font-size']).toBe('27px');
    expect(cellOf(html, 'Small print')['font-size']).toBe('15px');
  });

  it('gives an inherited disclaimer a muted tone of the canvas text colour', () => {
    const { html } = compile([{ id: 'd', type: 'disclaimer', content: 'Small print', style: {} }], {
      text_color: '#111827',
      background_color: '#ffffff',
    });
    const color = cellOf(html, 'Small print').color!;
    expect(color).toBe(mutedColor('#111827', '#ffffff', '#6b7280'));
    expect(color).not.toBe('#111827');
  });

  it('new blocks leave family / size / colour unset (follow the canvas)', () => {
    for (const type of ['text', 'heading', 'disclaimer']) {
      const block = getBlockDefinition(type)!.create() as unknown as { style: TextStyle };
      expect(block.style.font_family, type).toBeUndefined();
      expect(block.style.font_size, type).toBeUndefined();
      expect(block.style.color, type).toBeUndefined();
    }
  });

  it('exposes the inherited values for the UI placeholders', () => {
    const canvasCfg = { font_family: 'Georgia, serif', font_size: 14, text_color: '#222222' };
    expect(inheritedTypography(canvasCfg, TEXT_TYPOGRAPHY)).toMatchObject({
      font_family: 'Georgia, serif',
      font_size: 14,
      color: '#222222',
      font_weight: 400,
    });
    expect(inheritedTypography(canvasCfg, HEADING_TYPOGRAPHY).font_size).toBe(18);
    expect(inheritedTypography(canvasCfg, DISCLAIMER_TYPOGRAPHY).font_size).toBe(10);
  });
});

describe('new style fields', () => {
  it('emits letter-spacing, text-transform, italic and alignment inline', () => {
    const { html } = compile([
      text('Styled', {
        letter_spacing: 1.5,
        text_transform: 'uppercase',
        font_style: 'italic',
        text_align: 'center',
      }),
    ]);
    const style = cellOf(html, 'Styled');
    expect(style['letter-spacing']).toBe('1.5px');
    expect(style['text-transform']).toBe('uppercase');
    expect(style['font-style']).toBe('italic');
    expect(style['text-align']).toBe('center');
  });

  it('supports negative tracking and capitalize; omits neutral values', () => {
    let style = cellOf(
      compile([text('Tight', { letter_spacing: -1, text_transform: 'capitalize' })]).html,
      'Tight',
    );
    expect(style['letter-spacing']).toBe('-1px');
    expect(style['text-transform']).toBe('capitalize');

    style = cellOf(
      compile([text('Plain', { letter_spacing: 0, text_transform: 'none', font_style: 'normal' })])
        .html,
      'Plain',
    );
    expect(style['letter-spacing']).toBeUndefined();
    expect(style['text-transform']).toBeUndefined();
    expect(style['font-style']).toBeUndefined();
  });

  it('writes an explicit line height in px with mso-line-height-rule:exactly', () => {
    const { html } = compile([text('Lined', { font_size: 15, line_height: 1.6 })]);
    const style = cellOf(html, 'Lined');
    expect(style['line-height']).toBe('24px');
    expect(style['mso-line-height-rule']).toBe('exactly');
    // Exactly one rule on the cell (the shell's Outlook pass must not add another).
    const cell = /<td style="([^"]*)">Lined<\/td>/.exec(html)![1]!;
    expect(cell.match(/mso-line-height-rule/g)).toHaveLength(1);
  });

  it('keeps the unitless default when no line height is stored', () => {
    const style = cellOf(compile([text('Default')]).html, 'Default');
    expect(style['line-height']).toBe('1.4');
  });

  it('gives resized rich-text spans a matching px line height', () => {
    const { html } = compile([
      text('<p>Hi <span style="font-size: 24px">Jane</span></p>', {
        font_size: 14,
        line_height: 1.5,
      }),
    ]);
    expect(declarations(html, 'span')).toEqual({ 'font-size': '24px', 'line-height': '36px' });
  });

  it('sanitises hostile style values instead of emitting them', () => {
    const { html } = compile([
      text('Hostile', {
        font_family: '"><img src=x onerror=alert(1)>',
        color: 'red;background:url(javascript:alert(1))',
        letter_spacing: 'x' as unknown as number,
        text_transform: 'evil' as unknown as 'none',
      }),
    ]);
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    const style = cellOf(html, 'Hostile');
    expect(style['font-family']).toBe('Arial, sans-serif');
    expect(style.color).toBe('#111827');
    expect(style['letter-spacing']).toBeUndefined();
    expect(style['text-transform']).toBeUndefined();
  });

  it('resolveTypography clamps sizes and spacing', () => {
    const t = resolveTypography(
      { font_size: 500, letter_spacing: 99 },
      { font_size: 14 },
      TEXT_TYPOGRAPHY,
    );
    expect(t.fontSize).toBe(96);
    expect(t.letterSpacing).toBe(20);
  });
});

describe('withStyleField', () => {
  it('sets a field or removes it for "inherit"', () => {
    expect(withStyleField({ color: '#111111' }, 'font_size', 16)).toEqual({
      color: '#111111',
      font_size: 16,
    });
    expect(withStyleField({ color: '#111111', font_size: 16 }, 'font_size', undefined)).toEqual({
      color: '#111111',
    });
    // PHP sends an empty style object back as [].
    expect(withStyleField([] as unknown as TextStyle, 'font_style', 'italic')).toEqual({
      font_style: 'italic',
    });
  });
});
