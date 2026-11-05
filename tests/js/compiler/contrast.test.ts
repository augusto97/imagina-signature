import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { contrastRatio, parseCssColor, composite } from '@/core/compiler/color';
import { contrastThreshold, findLowContrastText, meetsContrast } from '@/core/compiler/contrast';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, TextBlock } from '@/core/schema/blocks';
import { container } from '../fixtures/containers';
import '@/core/blocks';

function compile(blocks: Block[], canvasBg?: string) {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  if (canvasBg) schema.canvas.background_color = canvasBg;
  return compileSignature(schema);
}

const text = (
  id: string,
  color: string,
  fontSize = 12,
  extra: Partial<TextBlock> = {},
): TextBlock => ({
  id,
  type: 'text',
  content: 'Some words',
  style: { font_family: 'Arial', font_size: fontSize, font_weight: 400, color },
  ...extra,
});

const lowContrast = (result: ReturnType<typeof compile>) =>
  result.issues.filter((i) => i.code === 'low-contrast');

describe('contrast maths', () => {
  it('computes WCAG ratios', () => {
    const white = parseCssColor('#fff')!;
    expect(contrastRatio(parseCssColor('#000')!, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    expect(contrastRatio(parseCssColor('#777777')!, white)).toBeCloseTo(4.48, 2);
    expect(contrastRatio(parseCssColor('rgb(118, 118, 118)')!, white)).toBeGreaterThan(4.5);
  });

  it('parses hex (3/4/6/8), rgb(a), named and transparent colours', () => {
    expect(parseCssColor('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
    expect(parseCssColor('#11223380')!.a).toBeCloseTo(0.5, 2);
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor('White')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('transparent')!.a).toBe(0);
    expect(parseCssColor('var(--x)')).toBeNull();
  });

  it('composites semi-transparent colours over the background', () => {
    const c = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
    expect(Math.round(c.r)).toBe(128);
  });

  it('uses 4.5:1 for normal text and 3:1 for large (≥ 18px, or bold ≥ 14px)', () => {
    expect(contrastThreshold(12, false)).toBe(4.5);
    expect(contrastThreshold(13.9, true)).toBe(4.5);
    expect(contrastThreshold(14, false)).toBe(4.5);
    expect(contrastThreshold(17, false)).toBe(4.5);
    expect(contrastThreshold(14, true)).toBe(3);
    expect(contrastThreshold(18, false)).toBe(3);
    // #949494 on white ≈ 3.03:1 — fine for large text only.
    expect(meetsContrast('#949494', '#ffffff', 12)).toBe(false);
    expect(meetsContrast('#949494', '#ffffff', 18)).toBe(true);
    expect(meetsContrast('#949494', '#ffffff', 14, true)).toBe(true);
    expect(meetsContrast('#949494', '#ffffff', 14, false)).toBe(false);
  });
});

describe('findLowContrastText', () => {
  it('uses the nearest background: bgcolor, background-color, background shorthand', () => {
    const html =
      '<table bgcolor="#ffffff"><tr><td style="color:#ffffff;font-size:12px">' +
      '<span style="background:#000000 none">ok</span>' +
      '<span style="background-color:#eeeeee">bad</span></td></tr></table>';
    const findings = findLowContrastText(html);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.sample).toBe('bad');
    expect(findings[0]!.background).toBe('#eeeeee');
  });

  it('inherits size and weight (tags and font-weight) for the threshold', () => {
    const base = 'color:#949494;font-size:15px';
    expect(findLowContrastText(`<td style="${base}">x</td>`)).toHaveLength(1);
    expect(findLowContrastText(`<td style="${base};font-weight:700">x</td>`)).toHaveLength(0);
    expect(findLowContrastText(`<td style="${base}"><strong>x</strong></td>`)).toHaveLength(0);
    expect(findLowContrastText(`<td style="color:#949494;font-size:12pt">x</td>`)).toHaveLength(1);
    expect(findLowContrastText(`<td style="color:#949494;font-size:24px">x</td>`)).toHaveLength(0);
  });

  it('ignores hidden text, whitespace / &nbsp; and Outlook-only markup', () => {
    expect(
      findLowContrastText(
        '<td style="color:#fff">&nbsp; </td><td style="display:none;color:#fff">x</td>' +
          '<td style="font-size:0;color:#fff">x</td><!--[if mso]><center style="color:#fff">x</center><![endif]-->' +
          '<head><title>x</title></head>',
      ),
    ).toEqual([]);
  });

  it('attributes findings to the innermost block marker', () => {
    const findings = findLowContrastText(
      '<!--imgsig-block:container:row--><td style="color:#000">fine</td>' +
        '<!--imgsig-block:text:inner--><td style="color:#eeeeee">bad</td><!--/imgsig-block-->' +
        '<td style="color:#dddddd">also bad</td><!--/imgsig-block-->',
    );
    expect(findings.map((f) => f.block?.id)).toEqual(['inner', 'row']);
  });
});

describe('compiled contrast warnings', () => {
  it('flags text against the canvas background with the block attached', () => {
    const issues = lowContrast(compile([text('t', '#cccccc')]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.blockId).toBe('t');
    expect(issues[0]!.level).toBe('warning');
  });

  it('checks every size, not only tiny text', () => {
    expect(lowContrast(compile([text('t', '#999999', 16)]))).toHaveLength(1);
    expect(lowContrast(compile([text('t', '#767676', 16)]))).toHaveLength(0);
    expect(lowContrast(compile([text('t', '#949494', 20)]))).toHaveLength(0);
  });

  it('uses the block’s box background instead of the canvas', () => {
    // White text: fine on a dark box, invisible on the white canvas.
    expect(
      lowContrast(compile([text('t', '#ffffff', 12, { box: { background_color: '#111827' } })])),
    ).toHaveLength(0);
    expect(lowContrast(compile([text('t', '#ffffff', 12)]))).toHaveLength(1);
    // Dark text on a dark box is flagged even though the canvas is white.
    expect(
      lowContrast(compile([text('t', '#333333', 12, { box: { background_color: '#111827' } })])),
    ).toHaveLength(1);
  });

  it('uses the container column background', () => {
    const row = container('row', [[text('a', '#ffffff')], [text('b', '#ffffff')]]);
    row.columns[0]!.box = { background_color: '#0f172a' };
    const issues = lowContrast(compile([row]));
    expect(issues.map((i) => i.blockId)).toEqual(['b']);
  });

  it('uses the canvas background colour', () => {
    expect(lowContrast(compile([text('t', '#ffffff')], '#1e293b'))).toHaveLength(0);
    expect(lowContrast(compile([text('t', '#000000')], '#1e293b'))).toHaveLength(1);
  });

  it('flags button labels against the button colour', () => {
    const result = compile([
      {
        id: 'btn',
        type: 'button_cta',
        label: 'Go',
        href: 'https://x.example',
        background_color: '#fde68a',
        text_color: '#ffffff',
        border_radius: 4,
      },
    ]);
    expect(lowContrast(result).map((i) => i.blockId)).toEqual(['btn']);
  });

  it('reports one warning per block for repeated runs', () => {
    const result = compile([
      text('t', '#cccccc', 12, { content: '<p>one</p><p>two</p><p>three</p>' }),
    ]);
    expect(lowContrast(result)).toHaveLength(1);
  });
});
