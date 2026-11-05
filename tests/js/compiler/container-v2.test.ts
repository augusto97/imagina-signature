import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { minifyHtml } from '@/core/compiler/minify';
import { containerGeometry } from '@/core/blocks/container/definition';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, ContainerBlock, ImageBlock } from '@/core/schema/blocks';
import type { BoxStyle } from '@/core/schema/styles';
import { container, text } from '../fixtures/containers';
import '@/core/blocks';

/**
 * Container v2 + generic box compile output, inspected the way a mail
 * client would (DOMParser).
 */

function compile(blocks: Block[], width = 600) {
  const schema = createEmptySchema();
  schema.canvas.width = width;
  schema.blocks = blocks;
  return compileSignature(schema);
}

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

const img = (id: string, width: number): ImageBlock => ({
  id,
  type: 'image',
  src: `https://cdn.example.com/${id}.png`,
  alt: id,
  width,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
});

/** The cells of the container's row (the table right inside the shell cell). */
function columnCells(doc: Document): HTMLTableCellElement[] {
  const row = doc.querySelector('body > table > tbody > tr > td > table > tbody > tr');
  return Array.from(row?.children ?? []) as HTMLTableCellElement[];
}

describe('container v2: N columns', () => {
  it.each([
    [[33, 33, 34], 600, 16],
    [[25, 25, 25, 25], 600, 12],
    [[25, 50, 25], 523, 20],
    [[10, 20, 30, 40], 777, 0],
  ])('pixel widths of %j in %ipx (gap %i) sum to ≤ the available width', (widths, avail, gap) => {
    const lists = widths.map((_, i) => [text(`t${i}`, `Col ${i}`)]);
    const row = container('row', lists, { widths, gap });
    const { html } = compile([row], avail);
    const cells = columnCells(parse(html));
    expect(cells).toHaveLength(widths.length);
    const px = cells.map((td) => Number(td.getAttribute('width')));
    expect(px.every((w) => Number.isInteger(w) && w > 0)).toBe(true);
    expect(px.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(avail);
    cells.forEach((td, i) => expect(td.getAttribute('style')).toContain(`width:${widths[i]}%`));

    const geo = containerGeometry(row, avail);
    expect(geo.map((g) => g.outer)).toEqual(px);
    geo.forEach((g, i) => {
      const consumed = (i > 0 ? gap / 2 : 0) + (i < widths.length - 1 ? gap / 2 : 0);
      expect(g.inner).toBe(Math.floor(g.outer - consumed));
    });
  });

  it('clamps images to their column’s inner width', () => {
    const row = container('row', [[img('a', 500)], [img('b', 500)], [img('c', 500)]], {
      widths: [25, 50, 25],
      gap: 20,
    });
    const doc = parse(compile([row]).html);
    expect(doc.querySelector('img[alt="a"]')!.getAttribute('width')).toBe('140'); // 150 - 10
    expect(doc.querySelector('img[alt="b"]')!.getAttribute('width')).toBe('280'); // 300 - 20
    expect(doc.querySelector('img[alt="c"]')!.getAttribute('width')).toBe('140');
  });

  it('draws the divider as border-left + padding-left on columns 2..N only', () => {
    const row = container('row', [[text('a')], [text('b')], [text('c')]], {
      gap: 24,
      divider: { width: 2, style: 'dashed', color: '#2563EB' },
    });
    const cells = columnCells(parse(compile([row]).html));
    expect(cells[0]!.getAttribute('style')).not.toContain('border-left');
    expect(cells[0]!.getAttribute('style')).toContain('padding-right:12px');
    for (const td of cells.slice(1)) {
      expect(td.getAttribute('style')).toContain('border-left:2px dashed #2563eb');
      expect(td.getAttribute('style')).toContain('padding-left:12px');
    }
    // The divider eats into the inner width of columns 2..N.
    const geo = containerGeometry(row, 600);
    expect(geo[1]!.inner).toBe(Math.floor(geo[1]!.outer - 12 - 12 - 2));
  });

  it('applies per-column vertical alignment', () => {
    const row = container('row', [[text('a')], [text('b')], [text('c')]]);
    row.columns[1]!.valign = 'middle';
    row.columns[2]!.valign = 'bottom';
    const cells = columnCells(parse(compile([row]).html));
    expect(cells.map((td) => td.getAttribute('valign'))).toEqual(['top', 'middle', 'bottom']);
    expect(cells[1]!.getAttribute('style')).toContain('vertical-align:middle');
    expect(cells[2]!.getAttribute('style')).toContain('vertical-align:bottom');
  });

  it('paints the column box on the cell (full height) and switches to separate borders for radius', () => {
    const row = container('row', [[img('logo', 400)], [text('b')]], { gap: 16 });
    row.columns[0]!.box = {
      background_color: '#0F172A',
      border_radius: 10,
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      align: 'center',
    };
    const doc = parse(compile([row]).html);
    const table = doc.querySelector('body > table > tbody > tr > td > table')!;
    expect(table.getAttribute('style')).toContain('border-collapse:separate');
    const [first] = columnCells(doc);
    expect(first!.getAttribute('bgcolor')).toBe('#0f172a');
    expect(first!.getAttribute('align')).toBe('center');
    const style = first!.getAttribute('style')!;
    expect(style).toContain('background-color:#0f172a');
    expect(style).toContain('border-radius:10px');
    // Box padding + the gap half on the inner edge.
    expect(style).toContain('padding:8px 16px 8px 8px');
    expect(style).toContain('text-align:center');
    // 300 outer - 8 gap - 16 box padding.
    expect(doc.querySelector('img[alt="logo"]')!.getAttribute('width')).toBe('276');
  });

  it('compiles a container nested in a column against that column’s width', () => {
    const inner = container('inner', [[img('x', 500)], [img('y', 500)]], { gap: 0 });
    const outer = container('outer', [[inner], [text('t')]], { widths: [60, 40], gap: 0 });
    const doc = parse(compile([outer]).html);
    expect(doc.querySelector('img[alt="x"]')!.getAttribute('width')).toBe('180');
    expect(doc.querySelector('img[alt="y"]')!.getAttribute('width')).toBe('180');
  });

  it('skips hidden children and renders &nbsp; in empty columns', () => {
    const row = container('row', [
      [{ ...text('h', 'Hidden words'), visible: false }],
      [text('v', 'Shown')],
    ]);
    const { html } = compile([row]);
    expect(html).not.toContain('Hidden words');
    expect(columnCells(parse(html))[0]!.innerHTML).toBe('&nbsp;');
  });
});

describe('container v2: stack_on_mobile (hybrid)', () => {
  const stacked = (): ContainerBlock =>
    container('row', [[text('a', 'Alpha')], [text('b', 'Beta')], [text('c', 'Gamma')]], {
      widths: [25, 50, 25],
      gap: 16,
      stack_on_mobile: true,
    });

  it('emits inline-block columns capped at their pixel width', () => {
    const doc = parse(compile([stacked()]).html);
    const divs = Array.from(doc.querySelectorAll('div'));
    expect(divs).toHaveLength(3);
    const maxWidths = divs.map((d) => /max-width:(\d+)px/.exec(d.getAttribute('style') ?? '')?.[1]);
    expect(maxWidths).toEqual(['150', '300', '150']);
    for (const div of divs) {
      const style = div.getAttribute('style')!;
      expect(style).toContain('display:inline-block');
      expect(style).toContain('vertical-align:top');
      expect(style).toContain('width:100%');
    }
    expect(doc.body.textContent).toContain('Alpha');
    expect(doc.body.textContent).toContain('Gamma');
  });

  it('keeps the Outlook ghost table in conditional comments, through the minifier', () => {
    const { html } = compile([stacked()]);
    expect(html).toContain(
      '<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td width="150" valign="top"><![endif]-->',
    );
    expect(html).toContain('<!--[if mso]></td><td width="300" valign="top"><![endif]-->');
    expect(html).toContain('<!--[if mso]></td><td width="150" valign="top"><![endif]-->');
    expect(html).toContain('<!--[if mso]></td></tr></table><![endif]-->');
    // Re-minifying is a no-op for the conditionals.
    expect(minifyHtml(html)).toBe(html);
    // Openers and closers are balanced.
    expect(html.match(/<!--\[if mso\]>/g)?.length).toBe(html.match(/<!\[endif\]-->/g)?.length);
  });

  it('makes the shell fluid (max-width) with a fixed-width ghost table for Outlook', () => {
    const { html, fragment } = compile([stacked()], 600);
    const shell = parse(html).querySelector('body > table')!;
    expect(shell.getAttribute('width')).toBe('600');
    expect(shell.getAttribute('style')).toContain('width:100%');
    expect(shell.getAttribute('style')).toContain('max-width:600px');
    expect(fragment.startsWith('<!--[if mso]><table')).toBe(true);

    // Without stacking the shell stays fixed-width.
    const plain = parse(compile([container('r', [[text('a')], [text('b')]])]).html);
    expect(plain.querySelector('body > table')!.getAttribute('style')).toContain('width:600px');
  });
});

describe('container v2: boxes inside columns', () => {
  const boxed = (box: BoxStyle, block: Block): Block => ({ ...block, box });

  it('applies boxes to blocks nested in columns too', () => {
    const row = container(
      'row',
      [
        [
          boxed(
            { background_color: '#eeeeee', padding: { top: 0, right: 5, bottom: 0, left: 5 } },
            img('n', 500),
          ),
        ],
        [text('b')],
      ],
      { gap: 0 },
    );
    const doc = parse(compile([row]).html);
    expect(doc.querySelector('td[bgcolor="#eeeeee"]')).not.toBeNull();
    expect(doc.querySelector('img[alt="n"]')!.getAttribute('width')).toBe('290');
  });
});
