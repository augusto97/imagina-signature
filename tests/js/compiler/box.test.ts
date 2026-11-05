import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, ImageBlock, TextBlock } from '@/core/schema/blocks';
import type { BoxStyle } from '@/core/schema/styles';
import { compactBox, isBoxEmpty, resolveBorderSides } from '@/core/schema/box';
import '@/core/blocks';

/**
 * Generic `block.box` styling: every block compiles through
 * `compileBlock()`, which wraps it in an email-safe box table and
 * shrinks the width available to it. Inspected with DOMParser.
 */

function compile(blocks: Block[], width = 600) {
  const schema = createEmptySchema();
  schema.canvas.width = width;
  schema.blocks = blocks;
  return compileSignature(schema);
}

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

const text = (id: string, content: string): TextBlock => ({
  id,
  type: 'text',
  content,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

const img = (id: string, width: number): ImageBlock => ({
  id,
  type: 'image',
  src: `https://cdn.example.com/${id}.png`,
  alt: id,
  width,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
});

const boxed = (box: BoxStyle, block: Block = text('t', 'Inside')): Block => ({ ...block, box });

/** The first table inside the shell cell (the box table of the first block). */
const firstTable = (doc: Document): HTMLTableElement =>
  doc.querySelector('body > table > tbody > tr > td > table') as HTMLTableElement;

describe('box helpers', () => {
  it('per-side borders override the uniform border (width 0 removes an edge)', () => {
    const sides = resolveBorderSides({
      border: { width: 1, style: 'solid', color: '#111111' },
      border_top: { width: 0, style: 'solid', color: '#111111' },
      border_left: { width: 4, style: 'dashed', color: '#2563eb' },
    });
    expect(sides.top).toBeNull();
    expect(sides.right).toMatchObject({ width: 1 });
    expect(sides.left).toMatchObject({ width: 4, style: 'dashed' });
  });

  it('isBoxEmpty / compactBox', () => {
    expect(isBoxEmpty(undefined)).toBe(true);
    expect(isBoxEmpty({ padding: { top: 0, right: 0, bottom: 0, left: 0 } })).toBe(true);
    expect(isBoxEmpty({ align: 'left' })).toBe(true);
    expect(isBoxEmpty({ align: 'center' })).toBe(false);
    expect(isBoxEmpty({ background_color: '#fff' })).toBe(false);
    expect(compactBox({ background_color: '', border_radius: undefined })).toBeUndefined();
    expect(compactBox({ background_color: '#fff', width: undefined })).toEqual({
      background_color: '#fff',
    });
  });
});

describe('generic block box', () => {
  it('wraps any block in an email-safe box table', () => {
    const { html } = compile([
      boxed({
        background_color: '#FEF3C7',
        border: { width: 1, style: 'solid', color: '#f59e0b' },
        border_top: { width: 3, style: 'solid', color: '#b45309' },
        border_radius: 12,
        padding: { top: 10, right: 20, bottom: 10, left: 20 },
      }),
    ]);
    const table = firstTable(parse(html));
    expect(table.getAttribute('role')).toBe('presentation');
    expect(table.getAttribute('cellpadding')).toBe('0');
    expect(table.getAttribute('width')).toBe('100%');
    expect(table.getAttribute('style')).toContain('border-collapse:separate');
    const td = table.querySelector('td')!;
    expect(td.getAttribute('bgcolor')).toBe('#fef3c7');
    const style = td.getAttribute('style')!;
    expect(style).toContain('background-color:#fef3c7');
    expect(style).toContain('border-top:3px solid #b45309');
    expect(style).toContain('border-right:1px solid #f59e0b');
    expect(style).toContain('border-bottom:1px solid #f59e0b');
    expect(style).toContain('border-left:1px solid #f59e0b');
    expect(style).toContain('border-radius:12px');
    expect(style).toContain('padding:10px 20px 10px 20px');
    expect(td.textContent).toContain('Inside');
  });

  it('uses the border shorthand when all four sides match', () => {
    const { html } = compile([boxed({ border: { width: 2, style: 'dotted', color: '#ABCDEF' } })]);
    const style = firstTable(parse(html)).querySelector('td')!.getAttribute('style')!;
    expect(style).toContain('border:2px dotted #abcdef');
    expect(style).not.toContain('border-top');
  });

  it('reduces the width available to the boxed block by padding + borders', () => {
    const { html } = compile([
      boxed(
        {
          padding: { top: 0, right: 20, bottom: 0, left: 20 },
          border: { width: 1, style: 'solid', color: '#000000' },
        },
        img('wide', 600),
      ),
    ]);
    expect(parse(html).querySelector('img')!.getAttribute('width')).toBe('558');
  });

  it('positions a fixed-width box: center on the table, right via a wrapper cell', () => {
    const centered = parse(
      compile([boxed({ width: 300, align: 'center', background_color: '#ffffff' })]).html,
    );
    const table = firstTable(centered);
    expect(table.getAttribute('width')).toBe('300');
    expect(table.getAttribute('align')).toBe('center');
    expect(table.getAttribute('style')).toContain('width:300px');
    expect(table.querySelector('td')!.getAttribute('align')).toBe('center');

    const right = parse(
      compile([boxed({ width: 300, align: 'right', background_color: '#ffffff' })]).html,
    );
    const wrapper = firstTable(right);
    expect(wrapper.getAttribute('width')).toBe('100%');
    const cell = wrapper.querySelector('td')!;
    expect(cell.getAttribute('align')).toBe('right');
    expect(cell.querySelector('table')!.getAttribute('width')).toBe('300');
    expect(cell.querySelector('table')!.hasAttribute('align')).toBe(false); // never floats
  });

  it('clamps a fixed width to the available space with a warning', () => {
    const result = compile([boxed({ width: 900, background_color: '#ffffff' })], 500);
    expect(firstTable(parse(result.html)).getAttribute('width')).toBe('500');
    const issue = result.issues.find((i) => i.code === 'box-too-wide');
    expect(issue?.blockId).toBe('t');
    expect(issue?.level).toBe('warning');
  });

  it('emits nothing extra for an empty box, and nothing at all for a hidden boxed block', () => {
    const plain = compile([text('t', 'Inside')]).html;
    expect(compile([boxed({ padding: { top: 0, right: 0, bottom: 0, left: 0 } })]).html).toBe(
      plain,
    );
    expect(compile([boxed({ border: { width: 0, style: 'solid', color: '#000' } })]).html).toBe(
      plain,
    );
    const hidden = compile([{ ...boxed({ background_color: '#ff0000' }), visible: false }]).html;
    expect(hidden).not.toContain('#ff0000');
  });

  it('never lets box values break out of the style attribute', () => {
    const { html } = compile([
      boxed({
        background_color: 'red;background:url(javascript:alert(1))',
        border: { width: 2, style: 'solid', color: '"><script>x</script>' },
        border_radius: '5px;color:red' as unknown as number,
        padding: { top: 1, right: '2;x' as unknown as number, bottom: 3, left: 4 },
      }),
    ]);
    expect(html).not.toContain('javascript');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('color:red');
    const doc = parse(html);
    for (const el of Array.from(doc.querySelectorAll('[style]'))) {
      for (const decl of (el.getAttribute('style') ?? '').split(';').filter((d) => d.trim())) {
        expect(/^-?[a-z][a-z-]*:[^;"<>{}]+$/.test(decl.trim()), decl).toBe(true);
      }
    }
  });
});
