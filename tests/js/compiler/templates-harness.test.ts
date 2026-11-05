import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import type { Block } from '@/core/schema/blocks';
import { displayValue, normalizeContactRow } from '@/core/blocks/contact-row/normalize';
import {
  appliedTemplate,
  installMockSite,
  mergedVariables,
  templateSlugs as slugs,
} from '../fixtures/templateLibrary';
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

// Templates reference the profile / brand kit (`{{wp_*}}`, `{{company_*}}`)
// and `{{imgsig_assets_url}}`: compile them against a mock site.
let restore: () => void = () => {};
beforeAll(() => {
  restore = installMockSite();
});
afterAll(() => restore());

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
  // Language / direction of the shell (html + outer table).
  'lang',
  'dir',
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

/**
 * Child lists of a container in visual order, for raw template JSON in
 * either shape: 1.1 `columns[].children` or 1.0 `children` + `right_children`.
 */
function childListsOf(block: Block): Block[][] {
  const raw = block as unknown as {
    columns?: unknown;
    children?: Block[];
    right_children?: Block[];
  };
  if (Array.isArray(raw.columns)) {
    return (raw.columns as Array<{ children?: Block[] }>).map((c) => c.children ?? []);
  }
  return [raw.children ?? [], raw.right_children ?? []];
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
        // v1 rows and v2 items alike (the block normalises v1 on compile);
        // websites read without their scheme.
        for (const item of normalizeContactRow(b).items) {
          out.push(norm(displayValue(item, variables)));
        }
        break;
      case 'button_cta':
        out.push(norm(sub(b.label)));
        break;
      case 'container':
        for (const list of childListsOf(b)) out.push(...expectedTexts(list, variables));
        break;
      default:
        break;
    }
  }
  return out.filter(Boolean);
}

describe.each(slugs)('template %s', (slug) => {
  const schema = appliedTemplate(slug);
  let compiled: { result: ReturnType<typeof compileSignature>; doc: Document } | null = null;
  // Compiled lazily: the mock site is installed in beforeAll.
  const get = () => {
    if (!compiled) {
      const result = compileSignature(schema);
      compiled = { result, doc: new DOMParser().parseFromString(result.html, 'text/html') };
    }
    return compiled;
  };

  it('only uses allowlisted attributes (no quote garbage)', () => {
    const { doc } = get();
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
    const { doc } = get();
    for (const el of Array.from(doc.querySelectorAll('[style]'))) {
      const style = el.getAttribute('style') ?? '';
      for (const decl of style.split(';').filter((d) => d.trim() !== '')) {
        expect(DECLARATION.test(decl.trim()), `"${decl}" in ${slug}`).toBe(true);
      }
    }
  });

  it('contains no data: / javascript: URLs and no compile markers', () => {
    const { result, doc } = get();
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
    const { doc } = get();
    const visible = norm(doc.body.textContent ?? '');
    for (const text of expectedTexts(schema.blocks, mergedVariables(schema))) {
      expect(visible, `"${text}" in ${slug}`).toContain(text);
    }
  });

  it('compiles without errors', () => {
    const { result } = get();
    expect(result.errors).toEqual([]);
    expect(result.fragment.startsWith('<table')).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
  });
});
