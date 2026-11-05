import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSignature, type CompileResult } from '@/core/compiler/compile';
import type { Block, ContainerBlock } from '@/core/schema/blocks';
import type { SignatureSchema } from '@/core/schema/signature';
import type { BoxStyle } from '@/core/schema/styles';
import { BRAND_KIT_FONTS } from '@shared/brandKit';
import {
  ASSETS_URL,
  MOCK_SYSTEM_VARIABLES,
  PLUGIN_URL,
  appliedTemplate,
  installMockSite,
  loadTemplate,
  templateSlugs,
} from '../fixtures/templateLibrary';
import '@/core/blocks';

/**
 * Quality gate for the shipped template library (`templates/*.json`).
 *
 * Every template is compiled the way a real site would compile it — its
 * own example variables over mock profile / brand-kit values, QR and
 * vCard files uploaded — and must come out clean:
 *  - no diagnostics at all (errors or warnings: contrast, images too
 *    wide, missing alt, unresolved variables, Gmail length…);
 *  - pasteable fragment under 10,000 characters (Gmail's limit);
 *  - ≤ 600 px, web-safe fonts only;
 *  - images only from `{{company_logo}}`, `{{photo_url}}` or
 *    `{{imgsig_assets_url}}/templates/…` (never a hard-coded host);
 *  - variables limited to the canonical signature keys + system keys;
 *  - readable contrast (WCAG AA) for every text colour against the
 *    background it actually sits on (canvas, card or column).
 *
 * Visual review: `IMGSIG_TEMPLATE_DUMP=/some/dir npx vitest run tests/js/templates`
 * writes each compiled template to `<dir>/<slug>.html`; the images
 * resolve against `${PLUGIN_URL}`, so serve `assets/` there (or route
 * the requests) before screenshotting.
 */

const CANONICAL = new Set([
  'job_title',
  'department',
  'phone',
  'mobile',
  'photo_url',
  'linkedin_url',
  'calendar_url',
  'website_url',
  'address_line',
]);
const SYSTEM = new Set(Object.keys(MOCK_SYSTEM_VARIABLES));

const ALLOWED_FAMILIES = new Set(
  BRAND_KIT_FONTS.flatMap((f) => f.value.split(',')).map((f) => normFamily(f)),
);
const ALLOWED_STACKS = new Set<string>(BRAND_KIT_FONTS.map((f) => f.value));

const ASSET_IMAGE = /^\{\{imgsig_assets_url\}\}\/templates\/([a-z0-9-]+\.png)$/;
const IMAGE_VARIABLES = new Set(['{{company_logo}}', '{{photo_url}}']);
const TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function normFamily(name: string): string {
  return name
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
}

/** Every string in a JSON value, with the key it sits under. */
function strings(value: unknown, key = ''): Array<{ key: string; value: string }> {
  if (typeof value === 'string') return [{ key, value }];
  if (Array.isArray(value)) return value.flatMap((v) => strings(v, key));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, k));
  }
  return [];
}

function assetExists(file: string): boolean {
  return existsSync(resolve(__dirname, '../../../assets/templates', file));
}

// ---------------------------------------------------------------------------
// Contrast (WCAG 2.x) against the real background of each block
// ---------------------------------------------------------------------------

function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) throw new Error(`Non-hex colour ${a} / ${b}`);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA: 4.5:1 for body text, 3:1 for large text (≥ 18px, or ≥ 14px bold). */
function required(size: number, bold: boolean): number {
  return size >= 18 || (bold && size >= 14) ? 3 : 4.5;
}

interface ContrastProblem {
  where: string;
  ratio: number;
  min: number;
}

function contrastProblems(schema: SignatureSchema): ContrastProblem[] {
  const problems: ContrastProblem[] = [];
  const canvas = schema.canvas;
  const check = (where: string, fg: string, bg: string, size: number, bold: boolean): void => {
    const ratio = contrast(fg, bg);
    const min = required(size, bold);
    if (ratio < min) problems.push({ where, ratio: Number(ratio.toFixed(2)), min });
  };
  const inlineColors = (html: string): string[] =>
    Array.from(html.matchAll(/color:\s*(#[0-9a-f]{3,6})/gi), (m) => m[1]!);
  const boxBg = (box: BoxStyle | undefined, bg: string): string => box?.background_color ?? bg;

  const visit = (blocks: Block[], bg: string): void => {
    for (const block of blocks) {
      const here = boxBg(block.box, bg);
      const where = `${block.type}#${block.id}`;
      switch (block.type) {
        case 'heading':
        case 'text':
        case 'disclaimer': {
          const size =
            block.style.font_size ??
            (block.type === 'heading'
              ? Math.round((canvas.font_size * 18) / 14)
              : block.type === 'disclaimer'
                ? Math.round((canvas.font_size * 10) / 14)
                : canvas.font_size);
          const bold = (block.style.font_weight ?? (block.type === 'heading' ? 700 : 400)) >= 700;
          const color = block.style.color ?? canvas.text_color;
          check(where, color, here, size, bold);
          const html = block.type === 'text' ? block.content : (block.content_html ?? '');
          for (const c of inlineColors(html)) check(`${where} span`, c, here, size, bold);
          if (/<a\s/i.test(html) && !/<a[^>]*style=/i.test(html)) {
            check(`${where} link`, canvas.link_color, here, size, bold);
          }
          break;
        }
        case 'contact_row':
          check(where, block.style.color, here, block.style.font_size, false);
          if (block.link_color)
            check(`${where} link`, block.link_color, here, block.style.font_size, false);
          break;
        case 'button_cta': {
          const size = block.style?.font_size ?? canvas.font_size;
          const filled =
            block.preset === undefined || block.preset === 'solid' || block.preset === 'pill';
          check(where, block.text_color, filled ? block.background_color : here, size, true);
          break;
        }
        case 'vcard':
          check(
            where,
            block.text_color,
            block.link_style === 'text' ? here : block.background_color,
            13,
            false,
          );
          break;
        case 'qr_code':
          if (block.caption) check(`${where} caption`, '#475569', here, 11, false);
          break;
        case 'container':
          for (const column of (block as ContainerBlock).columns) {
            visit(column.children, boxBg(column.box, here));
          }
          break;
        default:
          break;
      }
    }
  };
  visit(schema.blocks, canvas.background_color);
  return problems;
}

// ---------------------------------------------------------------------------

let restore: () => void = () => {};
beforeAll(() => {
  restore = installMockSite();
});
afterAll(() => restore());

const DUMP_DIR = process.env.IMGSIG_TEMPLATE_DUMP;

describe('template library', () => {
  it('ships at least 40 templates', () => {
    expect(templateSlugs.length).toBeGreaterThanOrEqual(40);
  });

  describe.each(templateSlugs)('%s', (slug) => {
    const raw = loadTemplate(slug);
    let compiled: CompileResult | null = null;
    const result = (): CompileResult => {
      compiled ??= compileSignature(appliedTemplate(slug));
      return compiled;
    };

    it('is schema 1.1, at most 600 px wide, in a web-safe font', () => {
      expect(raw.schema_version).toBe('1.1');
      expect(raw.canvas.width).toBeLessThanOrEqual(600);
      expect(ALLOWED_STACKS.has(raw.canvas.font_family)).toBe(true);
      for (const { key, value } of strings(raw.blocks)) {
        if (key === 'font_family') expect(ALLOWED_STACKS.has(value), value).toBe(true);
      }
    });

    it('declares only canonical variables and uses only known tokens', () => {
      const declared = Object.keys(raw.variables ?? {});
      for (const key of declared) expect(CANONICAL.has(key), key).toBe(true);

      const used = new Set<string>();
      for (const { value } of strings(raw.blocks)) {
        for (const m of value.matchAll(TOKEN)) used.add(m[1]!);
      }
      for (const name of used) {
        expect(CANONICAL.has(name) || SYSTEM.has(name), `{{${name}}}`).toBe(true);
        // Canonical keys the template uses come with an example value.
        if (CANONICAL.has(name)) expect(declared, `{{${name}}} needs an example`).toContain(name);
      }
      // Identity always comes from the profile.
      expect(used.has('wp_display_name') || used.has('wp_email')).toBe(true);
    });

    it('never hard-codes a host; images come from variables or the template assets', () => {
      for (const { key, value } of strings(raw.blocks)) {
        expect(value, `${key}: ${value}`).not.toMatch(/:\/\//);
      }
      const images: string[] = [];
      const collect = (blocks: Block[]): void => {
        for (const b of blocks) {
          if (b.type === 'image' || b.type === 'avatar' || b.type === 'banner') images.push(b.src);
          if (b.type === 'container') b.columns.forEach((c) => collect(c.children));
        }
      };
      collect(raw.blocks);
      for (const src of images) {
        const asset = ASSET_IMAGE.exec(src);
        expect(IMAGE_VARIABLES.has(src) || (asset !== null && assetExists(asset[1]!)), src).toBe(
          true,
        );
      }
      const photo = raw.variables?.photo_url;
      if (photo !== undefined) {
        const asset = ASSET_IMAGE.exec(photo);
        expect(asset !== null && assetExists(asset[1]!), photo).toBe(true);
      }
    });

    it('compiles without any diagnostic', () => {
      expect(result().issues.map((i) => `${i.code}: ${i.message}`)).toEqual([]);
    });

    it('fits Gmail (fragment under 10,000 characters)', () => {
      expect(result().fragment.length).toBeLessThan(10_000);
    });

    it('uses only web-safe font families in the output', () => {
      const families = Array.from(result().html.matchAll(/font-family:([^;"]+)/g), (m) => m[1]!)
        .flatMap((stack) => stack.split(','))
        .map(normFamily);
      for (const family of families) expect(ALLOWED_FAMILIES.has(family), family).toBe(true);
    });

    it('gives every image a width and alt text, all hosted on the site', () => {
      const doc = new DOMParser().parseFromString(result().fragment, 'text/html');
      for (const img of Array.from(doc.querySelectorAll('img'))) {
        const src = img.getAttribute('src') ?? '';
        expect(src.startsWith(`${PLUGIN_URL}/`), src).toBe(true);
        expect(Number(img.getAttribute('width'))).toBeGreaterThan(0);
        expect(img.hasAttribute('alt')).toBe(true);
        // Only the decorative contact icons may have an empty alt.
        if (!src.startsWith(`${ASSETS_URL}/icons/`)) {
          expect(img.getAttribute('alt')!.trim(), src).not.toBe('');
        }
      }
    });

    it('keeps text readable against its own background', () => {
      expect(contrastProblems(raw)).toEqual([]);
    });

    if (DUMP_DIR) {
      it('dumps the compiled HTML for visual review', () => {
        mkdirSync(DUMP_DIR, { recursive: true });
        writeFileSync(resolve(DUMP_DIR, `${slug}.html`), result().html);
      });
    }
  });
});
