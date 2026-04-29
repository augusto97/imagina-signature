import { describe, it, expect } from 'vitest';
import { compileToMjml } from '../../../assets/editor/src/compiler/json-to-mjml';
import { emptySchema } from '../../../assets/editor/src/schema/signature';
import { interpolate } from '../../../assets/editor/src/compiler/variables';
import { validateEmailHtml } from '../../../assets/editor/src/compiler/html-validator';
import { minifyHtml } from '../../../assets/editor/src/compiler/html-minifier';

describe('compileToMjml', () => {
  it('emits an mjml document for an empty schema', () => {
    const out = compileToMjml(emptySchema());
    expect(out).toMatch(/^<mjml>/);
    expect(out).toContain('<mj-body');
  });

  it('renders a text block', () => {
    const schema = emptySchema();
    schema.blocks = [
      {
        id: 't',
        type: 'text',
        grid: { col: 1, row: 1 },
        content: 'Hello {{name}}',
        style: { font_size: 14 },
      },
    ];
    schema.variables = { name: 'World' };
    const out = compileToMjml(schema);
    expect(out).toContain('Hello World');
  });

  it('skips invisible blocks', () => {
    const schema = emptySchema();
    schema.blocks = [
      {
        id: 't',
        type: 'text',
        grid: { col: 1, row: 1 },
        content: 'INVISIBLE_CONTENT',
        style: {},
        visible: false,
      },
    ];
    const out = compileToMjml(schema);
    expect(out).not.toContain('INVISIBLE_CONTENT');
  });
});

describe('interpolate', () => {
  it('replaces known placeholders', () => {
    expect(interpolate('Hi {{name}}!', { name: 'A' })).toBe('Hi A!');
  });
  it('leaves unknown placeholders intact', () => {
    expect(interpolate('Hi {{x}}!', {})).toBe('Hi {{x}}!');
  });
});

describe('validateEmailHtml', () => {
  it('warns about missing alt on images', () => {
    const warnings = validateEmailHtml('<img src="x" width="10">');
    expect(warnings.some((w) => w.includes('alt'))).toBe(true);
  });
  it('warns about size > 102 KB', () => {
    const big = '<p>' + 'a'.repeat(110 * 1024) + '</p>';
    const warnings = validateEmailHtml(big);
    expect(warnings.some((w) => w.includes('102'))).toBe(true);
  });
});

describe('minifyHtml', () => {
  it('collapses whitespace but preserves MSO conditionals', () => {
    const input = '<!--[if mso]>X<![endif]--> <p>   hi   </p>';
    const out = minifyHtml(input);
    expect(out).toContain('<!--[if mso]>X<![endif]-->');
    expect(out).toContain('<p> hi </p>');
  });
});
