import { describe, expect, it } from 'vitest';
import {
  attr,
  cssValue,
  fontStack,
  inlineStyle,
  intPx,
  paddingCss,
  px,
  safeColor,
} from '@/core/compiler/css';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import '@/core/blocks';

/** The eight stacks offered by FontFamilyInput (several carry double quotes). */
const FONTS = [
  'Arial, sans-serif',
  'Helvetica, Arial, sans-serif',
  'Tahoma, Geneva, sans-serif',
  'Verdana, Geneva, sans-serif',
  '"Trebuchet MS", sans-serif',
  'Georgia, serif',
  '"Times New Roman", Times, serif',
  '"Courier New", Courier, monospace',
];

describe('cssValue', () => {
  it('turns double quotes into single quotes', () => {
    expect(cssValue('"Trebuchet MS", sans-serif')).toBe("'Trebuchet MS', sans-serif");
  });

  it('strips declaration / rule / tag breakers and newlines', () => {
    expect(cssValue('red;background:blue')).toBe('redbackground:blue');
    expect(cssValue('a{b}<c>\nd\\e&f')).toBe('abcdef');
  });

  it('drops url(), expression() and javascript: values entirely', () => {
    expect(cssValue('url(javascript:alert(1))')).toBe('');
    expect(cssValue('expression(alert(1))')).toBe('');
    expect(cssValue('javascript:alert(1)')).toBe('');
  });
});

describe('safeColor', () => {
  it.each([
    '#fff',
    '#FFFFFF',
    '#11223344',
    'rgb(1, 2, 3)',
    'rgba(1,2,3,0.5)',
    'white',
    'transparent',
  ])('accepts %s', (c) => {
    expect(safeColor(c, 'FALLBACK')).not.toBe('FALLBACK');
  });

  it.each(['red;x:y', '#12', 'url(x)', '"><script>', 'expression(1)', '', 'hsl(1,2%,3%)'])(
    'rejects %s',
    (c) => {
      expect(safeColor(c, 'FALLBACK')).toBe('FALLBACK');
    },
  );
});

describe('fontStack', () => {
  it('re-quotes multi-word families with single quotes', () => {
    expect(fontStack('"Times New Roman", Times, serif')).toBe("'Times New Roman', Times, serif");
  });

  it('drops invalid family names and falls back when nothing is left', () => {
    expect(fontStack('Arial, "x;y", sans-serif')).toBe('Arial, sans-serif');
    expect(fontStack('"><img src=x>')).toBe('Arial, sans-serif');
    expect(fontStack(undefined, 'Georgia, serif')).toBe('Georgia, serif');
  });
});

describe('attr / px helpers', () => {
  it('escapes every attribute-breaking character', () => {
    expect(attr(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });

  it('clamps numbers and falls back on garbage', () => {
    expect(px(5000, 0, 100)).toBe(100);
    expect(px('abc', 0, 100, 7)).toBe(7);
    expect(intPx(12.6)).toBe(13);
    expect(paddingCss({ top: 1, right: -5, bottom: 3, left: 4 })).toBe('1px 0px 3px 4px');
  });

  it('inlineStyle skips empty values and sanitises the rest', () => {
    expect(inlineStyle({ color: '#000', fontFamily: '"A B", serif', padding: '', x: null })).toBe(
      "color:#000;font-family:'A B', serif",
    );
  });
});

function typography(font: string) {
  return { font_family: font, font_size: 14, font_weight: 400 as const, color: '#111827' };
}

function blocksFor(font: string): Block[] {
  return [
    { id: 'h', type: 'heading', content: 'Jane Doe', style: typography(font) },
    {
      id: 't',
      type: 'text',
      content: '<strong>Jane</strong> <em>Doe</em>',
      style: typography(font),
    },
    { id: 'd', type: 'disclaimer', content: 'Confidential', style: typography(font) },
    {
      id: 'c',
      type: 'contact_row',
      rows: [{ icon: 'email', label: 'jane@acme.com', href: 'mailto:jane@acme.com' }],
      style: typography(font),
    },
  ];
}

const KNOWN_ATTRS = new Set([
  'role',
  'cellpadding',
  'cellspacing',
  'border',
  'width',
  'height',
  'style',
  'href',
  // Contact rows carry hosted PNG icons.
  'src',
  'alt',
  'xmlns',
  'xmlns:v',
  'xmlns:o',
  'http-equiv',
  'content',
  'name',
  'bgcolor',
  'align',
  'valign',
  // Language / direction of the shell (html + outer table).
  'lang',
  'dir',
]);

describe('font stacks never corrupt inline styles', () => {
  it.each(FONTS)('compiles blocks using %s', (font) => {
    const schema = createEmptySchema();
    schema.canvas.font_family = font;
    schema.blocks = blocksFor(font);

    const { html } = compileSignature(schema);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    for (const el of Array.from(doc.querySelectorAll('*'))) {
      for (const a of Array.from(el.attributes)) {
        expect(KNOWN_ATTRS.has(a.name), `stray attribute "${a.name}" on <${el.tagName}>`).toBe(
          true,
        );
      }
    }

    const styled = Array.from(doc.querySelectorAll('[style*="font-family"]'));
    // Shell table + heading + text + disclaimer + contact row.
    expect(styled.length).toBeGreaterThanOrEqual(5);
    const expected = fontStack(font);
    for (const el of styled) {
      const style = el.getAttribute('style') ?? '';
      expect(style).toContain(`font-family:${expected}`);
      expect(style).not.toContain('"');
    }
  });
});
