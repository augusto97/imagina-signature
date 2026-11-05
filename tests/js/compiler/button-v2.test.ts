import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, ButtonCtaBlock } from '@/core/schema/blocks';
import { applyButtonPreset, vmlButtonWidth } from '@/core/blocks/button-cta/definition';
import { resolveButtonSpec } from '@/core/blocks/button-cta/buttonMarkup';
import { getBlockDefinition } from '@/core/blocks/registry';
import '@/core/blocks';

/**
 * Button v2: presets, padding, typography, border, full width,
 * alignment, and a VML shape that matches the cell button.
 */

function compile(blocks: Block[], width = 600) {
  const schema = createEmptySchema();
  schema.canvas.width = width;
  schema.blocks = blocks;
  return compileSignature(schema);
}

const button = (extra: Partial<ButtonCtaBlock> = {}): ButtonCtaBlock => ({
  id: 'btn',
  type: 'button_cta',
  label: 'Book a call',
  href: 'https://acme.example/book',
  background_color: '#dc2626',
  text_color: '#ffffff',
  border_radius: 6,
  ...extra,
});

const vmlOf = (html: string) => /<v:roundrect[^>]*>/.exec(html)?.[0] ?? null;
const centerOf = (html: string) => /<center style="([^"]*)">/.exec(html)?.[1] ?? '';

function cellButton(html: string) {
  const revealed = /<!--\[if !mso\]><!-- -->([\s\S]*?)<!--<!\[endif\]-->/.exec(html)?.[1];
  expect(revealed).toBeDefined();
  const doc = new DOMParser().parseFromString(revealed!, 'text/html');
  return {
    table: doc.querySelector('table')!,
    td: doc.querySelector('td')!,
    a: doc.querySelector('a')!,
  };
}

function wrapperCell(html: string): HTMLTableCellElement {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // The block's full-width row is the first nested table in the shell.
  return doc.querySelector(
    'body > table td table[width="100%"] > tbody > tr > td',
  ) as HTMLTableCellElement;
}

describe('button v1 rows keep their look', () => {
  it('solid, 12 × 24 padding, 14px semibold, 40px VML', () => {
    const { html } = compile([button()]);
    const { td, a } = cellButton(html);
    expect(td.getAttribute('bgcolor')).toBe('#dc2626');
    expect(td.getAttribute('style')).toBe(
      'background-color:#dc2626;border-radius:6px;padding:12px 24px',
    );
    const linkStyle = a.getAttribute('style')!;
    expect(linkStyle).toContain('font-size:14px');
    expect(linkStyle).toContain('font-weight:600');
    expect(linkStyle).toContain('line-height:16px');
    const vml = vmlOf(html)!;
    expect(vml).toContain('height:40px');
    expect(vml).toContain(`width:${vmlButtonWidth('Book a call')}px`);
    expect(vml).toContain('stroke="f"');
    expect(vml).toContain('fillcolor="#dc2626"');
  });
});

describe('label typography', () => {
  it('inherits the canvas font family and size when unset', () => {
    const schema = createEmptySchema();
    schema.canvas.font_family = 'Verdana, Geneva, sans-serif';
    schema.canvas.font_size = 15;
    schema.blocks = [button()];
    const { html } = compileSignature(schema);
    const link = cellButton(html).a.getAttribute('style')!;
    expect(link).toContain('font-family:Verdana, Geneva, sans-serif');
    expect(link).toContain('font-size:15px');
    expect(centerOf(html)).toContain('font-family:Verdana, Geneva, sans-serif');
  });

  it('new buttons leave the label family / size unset', () => {
    const created = getBlockDefinition('button_cta')!.create() as ButtonCtaBlock;
    expect(created.style?.font_family).toBeUndefined();
    expect(created.style?.font_size).toBeUndefined();
    expect(created).toMatchObject({ preset: 'solid', padding_x: 24, padding_y: 12, align: 'left' });
  });
});

describe('presets', () => {
  it('outline: no fill, a border in the button colour, VML stroke only', () => {
    const block = { ...button(), ...applyButtonPreset(button(), 'outline') } as ButtonCtaBlock;
    expect(block.text_color).toBe('#dc2626'); // white label would vanish without a fill
    const { html } = compile([block]);
    const { td } = cellButton(html);
    expect(td.hasAttribute('bgcolor')).toBe(false);
    expect(td.getAttribute('style')).not.toContain('background-color');
    expect(td.getAttribute('style')).toContain('border:2px solid #dc2626');
    const vml = vmlOf(html)!;
    expect(vml).toContain('filled="f"');
    expect(vml).toContain('strokecolor="#dc2626"');
    expect(vml).toContain('strokeweight="2px"');
    expect(vml).not.toContain('fillcolor');
    // Border adds to the VML size.
    expect(vml).toContain('height:44px');
  });

  it('pill: fully rounded in CSS and VML', () => {
    const { html } = compile([button({ preset: 'pill', border_radius: 4 })]);
    expect(cellButton(html).td.getAttribute('style')).toContain('border-radius:999px');
    expect(vmlOf(html)).toContain('arcsize="50%"');
  });

  it('text link: a plain underlined link, no VML, no cell button', () => {
    const block = { ...button(), ...applyButtonPreset(button(), 'text') } as ButtonCtaBlock;
    const { html } = compile([block]);
    expect(vmlOf(html)).toBeNull();
    expect(html).not.toContain('<!--[if !mso]>');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const a = doc.querySelector('a[href="https://acme.example/book"]')!;
    expect(a.getAttribute('style')).toContain('text-decoration:underline');
    expect(a.getAttribute('style')).toContain('color:#dc2626');
    expect(a.closest('td')!.hasAttribute('bgcolor')).toBe(false);
  });

  it('solid with a border keeps the fill and strokes the VML', () => {
    const { html } = compile([button({ border_width: 3, border_color: '#111111' })]);
    expect(cellButton(html).td.getAttribute('style')).toContain('border:3px solid #111111');
    const vml = vmlOf(html)!;
    expect(vml).toContain('fillcolor="#dc2626"');
    expect(vml).toContain('strokecolor="#111111"');
    expect(vml).toContain('strokeweight="3px"');
  });

  it('going back to a filled preset turns a fill-coloured label white', () => {
    const outline = { ...button(), ...applyButtonPreset(button(), 'outline') } as ButtonCtaBlock;
    expect(applyButtonPreset(outline, 'solid').text_color).toBe('#ffffff');
    expect(
      applyButtonPreset(button({ text_color: '#000000' }), 'outline').text_color,
    ).toBeUndefined();
  });
});

describe('VML sizing', () => {
  it('grows with the horizontal padding and font size', () => {
    const wide = compile([button({ padding_x: 40 })]).html;
    expect(vmlOf(wide)).toContain(`width:${vmlButtonWidth('Book a call', { paddingX: 40 })}px`);

    const big = compile([button({ style: { font_size: 20 }, padding_y: 14 })]).html;
    const width = vmlButtonWidth('Book a call', { fontSize: 20 });
    expect(vmlOf(big)).toContain(`width:${width}px`);
    expect(vmlOf(big)).toContain(`height:${Math.round(20 * (16 / 14)) + 28}px`);
    expect(width).toBeGreaterThan(vmlButtonWidth('Book a call'));
  });

  it('accounts for uppercase and letter spacing', () => {
    const plain = vmlButtonWidth('Download the catalogue');
    expect(vmlButtonWidth('Download the catalogue', { uppercase: true })).toBeGreaterThan(plain);
    expect(vmlButtonWidth('Download the catalogue', { letterSpacing: 2 })).toBe(
      Math.round(22 * (8.5 + 2) + 48),
    );
    const { html } = compile([
      button({
        label: 'Download the catalogue',
        style: { text_transform: 'uppercase', letter_spacing: 2 },
      }),
    ]);
    expect(vmlOf(html)).toContain(
      `width:${vmlButtonWidth('Download the catalogue', { uppercase: true, letterSpacing: 2 })}px`,
    );
    expect(centerOf(html)).toContain('letter-spacing:2px');
    expect(centerOf(html)).toContain('text-transform:uppercase');
  });

  it('full width spans the available width in both branches', () => {
    const { html } = compile(
      [button({ full_width: true, padding: { top: 0, right: 10, bottom: 0, left: 10 } })],
      500,
    );
    expect(vmlOf(html)).toContain('width:480px');
    const { table, td } = cellButton(html);
    expect(table.getAttribute('width')).toBe('100%');
    expect(table.getAttribute('style')).toContain('width:100%');
    expect(td.getAttribute('align')).toBe('center');
    expect(td.getAttribute('style')).toContain('text-align:center');
  });

  it('matches the VML label typography to the cell button', () => {
    const { html } = compile([
      button({
        style: {
          font_family: 'Georgia, serif',
          font_size: 16,
          font_weight: 700,
          font_style: 'italic',
        },
        text_color: '#fefefe',
      }),
    ]);
    const center = centerOf(html);
    const link = cellButton(html).a.getAttribute('style')!;
    for (const decl of [
      'color:#fefefe',
      'font-family:Georgia, serif',
      'font-size:16px',
      'font-weight:700',
      'font-style:italic',
    ]) {
      expect(center).toContain(decl);
      expect(link).toContain(decl);
    }
  });
});

describe('alignment', () => {
  it.each([
    ['center', '0 auto'],
    ['right', '0 0 0 auto'],
  ] as const)('%s-aligns the button in its row', (align, margin) => {
    const { html } = compile([button({ align })]);
    const row = wrapperCell(html);
    expect(row.getAttribute('align')).toBe(align);
    expect(row.getAttribute('style')).toContain(`text-align:${align}`);
    const { table } = cellButton(html);
    expect(table.getAttribute('align')).toBe(align);
    expect(table.getAttribute('style')).toContain(`margin:${margin}`);
  });

  it('defaults to left without an align attribute on the button table', () => {
    const { html } = compile([button()]);
    expect(wrapperCell(html).getAttribute('align')).toBe('left');
    expect(cellButton(html).table.hasAttribute('align')).toBe(false);
  });
});

describe('resolveButtonSpec', () => {
  it('clamps padding / border and validates colours', () => {
    const spec = resolveButtonSpec(
      button({
        padding_x: 500,
        padding_y: -3,
        border_width: 99,
        background_color: 'url(x)',
        text_color: 'nope',
      }),
      null,
    );
    expect(spec.paddingX).toBe(64);
    expect(spec.paddingY).toBe(0);
    expect(spec.borderWidth).toBe(8);
    expect(spec.fill).toBe('#1d4ed8');
    expect(spec.textColor).toBe('#ffffff');
  });
});
