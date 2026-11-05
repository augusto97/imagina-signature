import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, ContainerBlock, ImageBlock } from '@/core/schema/blocks';
import { containerGeometry } from '@/core/blocks/container/definition';
import '@/core/blocks';

function compile(blocks: Block[], width = 600, bg = '#ffffff') {
  const schema = createEmptySchema();
  schema.canvas.width = width;
  schema.canvas.background_color = bg;
  schema.blocks = blocks;
  return compileSignature(schema);
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const img = (id: string, width: number, height?: number): ImageBlock => ({
  id,
  type: 'image',
  src: `https://cdn.example.com/${id}.png`,
  alt: id,
  width,
  height,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
});

const container = (left: Block[], right: Block[], leftWidth = 25, gap = 16): ContainerBlock => ({
  id: 'row',
  type: 'container',
  gap,
  columns: [
    { id: 'col_l', width: leftWidth, children: left },
    { id: 'col_r', width: 100 - leftWidth, children: right },
  ],
});

const geo = (leftWidth: number, gap: number, available: number) =>
  containerGeometry(container([], [], leftWidth, gap), available).map((g) => ({
    outer: g.outer,
    inner: g.inner,
  }));

describe('canvas background', () => {
  it('reaches the shell table and cell (not only <body>)', () => {
    const { html } = compile([], 600, '#fef3c7');
    const doc = parse(html);
    const table = doc.body.querySelector('table')!;
    expect(table.getAttribute('bgcolor')).toBe('#fef3c7');
    expect(table.getAttribute('style')).toContain('background-color:#fef3c7');
    const td = table.querySelector('td')!;
    expect(td.getAttribute('bgcolor')).toBe('#fef3c7');
    expect(td.getAttribute('style')).toContain('background-color:#fef3c7');
  });

  it('omits bgcolor for colours the legacy attribute cannot parse', () => {
    const { html } = compile([], 600, 'rgba(0,0,0,0.5)');
    const table = parse(html).body.querySelector('table')!;
    expect(table.hasAttribute('bgcolor')).toBe(false);
    expect(table.getAttribute('style')).toContain('background-color:rgba(0,0,0,0.5)');
  });
});

describe('container pixel widths', () => {
  it('splits the available width into outer px widths and inner widths', () => {
    expect(geo(25, 16, 600)).toEqual([
      { outer: 150, inner: 142 },
      { outer: 450, inner: 442 },
    ]);
    expect(geo(33, 0, 601).map((g) => g.outer)).toEqual([198, 403]);
  });

  it('emits width="<px>" on each cell and keeps the % style', () => {
    const { html } = compile([container([img('a', 50)], [img('b', 50)])]);
    const tds = Array.from(parse(html).querySelectorAll('td[width]'));
    const widths = tds.map((td) => td.getAttribute('width'));
    expect(widths).toEqual(['150', '450']);
    expect(tds[0]!.getAttribute('style')).toContain('width:25%');
    expect(tds[1]!.getAttribute('style')).toContain('width:75%');
  });

  it('clamps a too-wide image to its cell and keeps the aspect ratio', () => {
    const result = compile([container([img('logo', 300, 150)], [img('b', 50)])]);
    const logo = parse(result.html).querySelector('img[alt="logo"]')!;
    expect(logo.getAttribute('width')).toBe('142');
    expect(logo.getAttribute('height')).toBe('71');
    expect(logo.getAttribute('style')).toContain('max-width:100%');
    expect(logo.getAttribute('style')).toContain('height:auto');
    const warn = result.issues.find((i) => i.code === 'image-too-wide');
    expect(warn?.blockId).toBe('logo');
    expect(warn?.level).toBe('warning');
  });

  it('accounts for the image block padding', () => {
    const block = { ...img('p', 600), padding: { top: 0, right: 10, bottom: 0, left: 20 } };
    const { html } = compile([block]);
    expect(parse(html).querySelector('img')!.getAttribute('width')).toBe('570');
  });

  it('leaves images that fit untouched', () => {
    const result = compile([img('ok', 120, 120)]);
    const el = parse(result.html).querySelector('img')!;
    expect(el.getAttribute('width')).toBe('120');
    expect(el.getAttribute('height')).toBe('120');
    expect(result.issues.some((i) => i.code === 'image-too-wide')).toBe(false);
  });

  it('caps banners and avatars to the available width', () => {
    const banner: Block = {
      id: 'ban',
      type: 'banner',
      src: 'https://cdn.example.com/b.png',
      alt: 'Promo',
      link: 'https://acme.example',
      width: 800,
    };
    const avatar: Block = {
      id: 'av',
      type: 'avatar',
      src: 'https://cdn.example.com/a.png',
      alt: 'Me',
      size: 200,
    };
    const { html } = compile([container([avatar], [banner], 20, 20)]);
    const doc = parse(html);
    // left: 120 outer - 10 = 110 inner; right: 480 - 10 = 470 inner.
    expect(doc.querySelector('img[alt="Me"]')!.getAttribute('width')).toBe('110');
    expect(doc.querySelector('img[alt="Me"]')!.getAttribute('height')).toBe('110');
    expect(doc.querySelector('img[alt="Promo"]')!.getAttribute('width')).toBe('470');
  });

  it('caps a top-level banner to the canvas width', () => {
    const { html } = compile(
      [
        {
          id: 'ban',
          type: 'banner',
          src: 'https://cdn.example.com/b.png',
          alt: 'Promo',
          link: '',
          width: 800,
        },
      ],
      500,
    );
    expect(parse(html).querySelector('img')!.getAttribute('width')).toBe('500');
  });
});
