import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSignature } from '@/core/compiler/compile';
import type { Block } from '@/core/schema/blocks';
import type { SignatureSchema } from '@/core/schema/signature';
import { normalizeContactRow } from '@/core/blocks/contact-row/normalize';
import '@/core/blocks';

/**
 * Compiles EVERY shipped template and inspects the result the way a
 * mail client would (DOMParser):
 *  - every attribute on every element is on an allowlist (stray
 *    attributes are what unescaped quotes in a style turn into);
 *  - no data: / javascript: URL anywhere, no compile-time markers;
 *  - every style attribute is a clean declaration list;
 *  - the visible text of every text-ish block survives intact (no
 *    words joined by the minifier);
 *  - no error-level diagnostics.
 */

const TEMPLATES_DIR = resolve(__dirname, '../../../templates');
const slugs = readdirSync(TEMPLATES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

function load(slug: string): SignatureSchema {
  return JSON.parse(
    readFileSync(resolve(TEMPLATES_DIR, `${slug}.json`), 'utf8'),
  ) as SignatureSchema;
}

const ALLOWED_ATTRS = new Set([
  'role',
  'cellpadding',
  'cellspacing',
  'border',
  'width',
  'height',
  'style',
  'href',
  'src',
  'alt',
  'title',
  'target',
  'rel',
  'bgcolor',
  'align',
  'valign',
  'xmlns',
  'xmlns:v',
  'xmlns:o',
  'http-equiv',
  'content',
  'name',
]);

const DECLARATION = /^-?[a-z][a-z-]*:[^;"<>{}]+$/;

function norm(text: string): string {
  return text.replace(/[\s\u00a0]+/g, ' ').trim();
}

function textOf(html: string): string {
  return norm(
    new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body.textContent ?? '',
  );
}

/** Visible strings each block must produce, in schema order. */
function expectedTexts(blocks: Block[], variables: Record<string, string>): string[] {
  const out: string[] = [];
  const sub = (s: string) =>
    s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, n: string) => variables[n] ?? m);
  for (const b of blocks) {
    if (b.visible === false) continue;
    switch (b.type) {
      case 'heading':
      case 'disclaimer':
        for (const line of String(b.content).split(/\r?\n/))
          if (line.trim()) out.push(norm(sub(line)));
        break;
      case 'text':
        out.push(textOf(sub(b.content)));
        break;
      case 'contact_row':
        // v1 rows and v2 items alike (the block normalises v1 on compile).
        for (const item of normalizeContactRow(b).items) out.push(norm(sub(item.value)));
        break;
      case 'button_cta':
        out.push(norm(sub(b.label)));
        break;
      case 'container':
        out.push(
          ...expectedTexts(b.children, variables),
          ...expectedTexts(b.right_children ?? [], variables),
        );
        break;
      default:
        break;
    }
  }
  return out.filter(Boolean);
}

describe.each(slugs)('template %s', (slug) => {
  const schema = load(slug);
  const result = compileSignature(schema);
  const doc = new DOMParser().parseFromString(result.html, 'text/html');

  it('only uses allowlisted attributes (no quote garbage)', () => {
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      for (const a of Array.from(el.attributes)) {
        expect(
          ALLOWED_ATTRS.has(a.name),
          `<${el.tagName.toLowerCase()} ${a.name}> in ${slug}`,
        ).toBe(true);
      }
    }
  });

  it('has clean style declaration lists', () => {
    for (const el of Array.from(doc.querySelectorAll('[style]'))) {
      const style = el.getAttribute('style') ?? '';
      for (const decl of style.split(';').filter((d) => d.trim() !== '')) {
        expect(DECLARATION.test(decl.trim()), `"${decl}" in ${slug}`).toBe(true);
      }
    }
  });

  it('contains no data: / javascript: URLs and no compile markers', () => {
    expect(result.html).not.toMatch(/data:/i);
    expect(result.html).not.toMatch(/javascript:/i);
    expect(result.html).not.toContain('data-imgsig-src');
    expect(result.fragment).not.toMatch(/data:|javascript:/i);
    for (const el of Array.from(doc.querySelectorAll('[href],[src]'))) {
      const url = el.getAttribute('href') ?? el.getAttribute('src') ?? '';
      expect(/^(https?:|mailto:|tel:|#$)/.test(url), `${url} in ${slug}`).toBe(true);
    }
  });

  it('keeps every block’s words separated', () => {
    const visible = norm(doc.body.textContent ?? '');
    for (const text of expectedTexts(schema.blocks, schema.variables ?? {})) {
      expect(visible, `"${text}" in ${slug}`).toContain(text);
    }
  });

  it('compiles without errors', () => {
    expect(result.errors).toEqual([]);
    expect(result.fragment.startsWith('<table')).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
  });
});
