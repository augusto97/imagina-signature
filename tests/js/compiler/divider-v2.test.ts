import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, DividerBlock } from '@/core/schema/blocks';
import { getBlockDefinition } from '@/core/blocks/registry';
import '@/core/blocks';

/** Divider v2: style, thickness, colour, % / px length, alignment, spacing. */

function compile(blocks: Block[], width = 600) {
  const schema = createEmptySchema();
  schema.canvas.width = width;
  schema.blocks = blocks;
  return compileSignature(schema);
}

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

const divider = (extra: Partial<DividerBlock> = {}): DividerBlock => ({
  id: 'div',
  type: 'divider',
  border: { width: 1, color: '#e5e7eb', style: 'solid' },
  width_percent: 100,
  ...extra,
});

/** The 1px line cell, the table that sizes it and the row that positions it. */
function line(html: string) {
  const doc = parse(html);
  const cell = doc.querySelector('td[height="1"]')!;
  expect(cell).not.toBeNull();
  const table = cell.closest('table')!;
  const row = table.parentElement as HTMLElement;
  return { cell, table, row };
}

describe('divider v2', () => {
  it.each(['solid', 'dashed', 'dotted'] as const)('emits the %s style', (style) => {
    const { html } = compile([divider({ border: { width: 3, color: '#2563eb', style } })]);
    expect(line(html).cell.getAttribute('style')).toContain(`border-top:3px ${style} #2563eb`);
  });

  it('sizes the line in px, clamped to the available width', () => {
    let { table } = line(compile([divider({ width_unit: 'px', width_px: 120 })]).html);
    expect(table.getAttribute('width')).toBe('120');
    expect(table.getAttribute('style')).toContain('width:120px');

    ({ table } = line(
      compile(
        [
          divider({
            width_unit: 'px',
            width_px: 900,
            padding: { top: 0, right: 20, bottom: 0, left: 20 },
          }),
        ],
        500,
      ).html,
    ));
    expect(table.getAttribute('width')).toBe('460');
  });

  it('keeps percentage widths (legacy rows)', () => {
    const { table } = line(compile([divider({ width_percent: 40 })]).html);
    expect(table.getAttribute('width')).toBe('40%');
    expect(table.getAttribute('style')).toContain('width:40%');
  });

  it.each([
    ['center', '0 auto'],
    ['right', '0 0 0 auto'],
  ] as const)('%s-aligns a short line', (align, margin) => {
    const { table, row } = line(compile([divider({ width_percent: 30, align })]).html);
    expect(row.getAttribute('align')).toBe(align);
    expect(table.getAttribute('align')).toBe(align);
    expect(table.getAttribute('style')).toContain(`margin:${margin}`);
  });

  it('puts the vertical spacing on the row around the line', () => {
    const { row } = line(
      compile([divider({ padding: { top: 12, right: 0, bottom: 20, left: 0 } })]).html,
    );
    expect(row.getAttribute('style')).toContain('padding:12px 0px 20px 0px');
  });

  it('validates hostile values', () => {
    const { html } = compile([
      divider({
        border: { width: 99, color: 'red;x:url(javascript:1)', style: 'groove' as 'solid' },
        width_percent: 400,
        align: 'evil' as 'left',
      }),
    ]);
    const { cell, table, row } = line(html);
    expect(cell.getAttribute('style')).toContain('border-top:20px solid #e5e7eb');
    expect(table.getAttribute('width')).toBe('100%');
    expect(row.getAttribute('align')).toBe('left');
    expect(html).not.toContain('javascript:');
  });

  it('new dividers default to a full-width, left-aligned percentage line', () => {
    const block = getBlockDefinition('divider')!.create() as DividerBlock;
    expect(block).toMatchObject({ width_unit: 'percent', width_percent: 100, align: 'left' });
  });
});
