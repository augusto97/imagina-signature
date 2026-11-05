import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import { vmlButtonWidth } from '@/core/blocks/button-cta/definition';
import '@/core/blocks';

function compile(blocks: Block[], variables: Record<string, string> = {}) {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  schema.variables = variables;
  return compileSignature(schema);
}

const button = (label: string, extra: Partial<Block> = {}): Block =>
  ({
    id: 'btn',
    type: 'button_cta',
    label,
    href: 'https://acme.example/book',
    background_color: '#dc2626',
    text_color: '#ffffff',
    border_radius: 6,
    ...extra,
  }) as Block;

describe('divider markup', () => {
  const divider: Block = {
    id: 'div',
    type: 'divider',
    border: { width: 2, color: '#2563eb', style: 'dashed' },
    width_percent: 30,
    padding: { top: 4, right: 0, bottom: 8, left: 0 },
  };

  it('is a 1px table cell carrying the border, never an empty div', () => {
    const { html } = compile([divider]);
    expect(html).not.toMatch(/<div[^>]*border-top/);
    expect(html).toContain(
      '<td height="1" style="border-top:2px dashed #2563eb;font-size:1px;line-height:1px;',
    );
    expect(html).toMatch(/<td height="1"[^>]*>&nbsp;<\/td>/);
  });

  it('keeps the width percentage and the padding around the line', () => {
    const { html } = compile([divider]);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const outer = doc.querySelector('table[width="30%"]')!;
    expect(outer).not.toBeNull();
    expect(outer.getAttribute('style')).toContain('width:30%');
    expect(outer.querySelector('td')!.getAttribute('style')).toBe('padding:4px 0px 8px 0px');
    expect(outer.querySelector('table[width="100%"] td[height="1"]')).not.toBeNull();
  });

  it('survives the shape a rich-text paste keeps (non-empty cell)', () => {
    const { html } = compile([divider]);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cell = doc.querySelector('td[height="1"]')!;
    expect(cell.textContent).toBe('\u00a0');
  });
});

describe('button markup', () => {
  it('sizes the VML width from the label length (min 120)', () => {
    expect(vmlButtonWidth('Go')).toBe(120);
    expect(vmlButtonWidth('Book a 15-min call')).toBe(Math.round(18 * 8.5 + 48));
    const { html } = compile([button('Schedule a free 30-minute consultation')]);
    const vml = /<v:roundrect[^>]*>/.exec(html)![0];
    expect(vml).toContain(`width:${vmlButtonWidth('Schedule a free 30-minute consultation')}px`);
    expect(vml).not.toContain('width:200px');
  });

  it('resolves variables before measuring the label', () => {
    const { html } = compile([button('{{cta}}')], { cta: 'Download our brand new product catalogue' });
    const vml = /<v:roundrect[^>]*>/.exec(html)![0];
    expect(vml).toContain(`width:${vmlButtonWidth('Download our brand new product catalogue')}px`);
  });

  it('clamps the arc size for pill buttons', () => {
    const { html } = compile([button('Shop', { border_radius: 999 } as Partial<Block>)]);
    expect(html).toContain('arcsize="50%"');
  });

  it('falls back to a table-cell button for non-Outlook clients', () => {
    const { html } = compile([button('Book a call')]);
    const revealed = /<!--\[if !mso\]><!-- -->([\s\S]*?)<!--<!\[endif\]-->/.exec(html)![1]!;
    const doc = new DOMParser().parseFromString(revealed, 'text/html');
    const td = doc.querySelector('td[bgcolor]')!;
    expect(td.getAttribute('bgcolor')).toBe('#dc2626');
    expect(td.getAttribute('style')).toContain('background-color:#dc2626');
    expect(td.getAttribute('style')).toContain('border-radius:6px');
    expect(td.getAttribute('style')).toContain('padding:12px 24px');
    const a = td.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://acme.example/book');
    expect(a.textContent).toBe('Book a call');
  });

  it('keeps both conditional branches intact after minify', () => {
    const { html } = compile([button('Book a call')]);
    expect(html).toMatch(/<!--\[if mso\]>[\s\S]*<v:roundrect[\s\S]*<!\[endif\]-->/);
    expect(html).toMatch(/<!--\[if !mso\]><!-- -->[\s\S]*<a [^>]*>Book a call<\/a>[\s\S]*<!--<!\[endif\]-->/);
  });

  it('warns when the label cannot fit in Outlook', () => {
    const result = compile([button('x'.repeat(90))]);
    expect(result.issues.some((i) => i.code === 'button-too-wide')).toBe(true);
    const vml = /<v:roundrect[^>]*>/.exec(result.html)![0];
    expect(vml).toContain('width:600px');
  });
});
