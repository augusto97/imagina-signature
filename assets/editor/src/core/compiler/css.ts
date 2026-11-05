import type { Padding } from '@/core/schema/styles';

/**
 * Central serializer for every value the compiler interpolates into
 * the exported email HTML.
 *
 * Block compile functions MUST NOT concatenate raw schema strings into
 * markup. Schema values come from user input, templates, older stored
 * rows and hand-edited JSON, so any of them may carry characters that
 * break out of a `style="…"` attribute — the classic case being a font
 * stack like `"Trebuchet MS", sans-serif`, whose double quotes close the
 * attribute and spill the rest of the declaration list into garbage
 * attributes.
 *
 * Rules of thumb for callers:
 *  - text content            → {@link escapeHtml}
 *  - attribute values        → {@link attr}
 *  - CSS declaration lists   → {@link inlineStyle} (values pass through
 *                              {@link cssValue}; already attribute-safe
 *                              inside double quotes)
 *  - colours                 → {@link safeColor}
 *  - font stacks             → {@link fontStack}
 *  - numeric lengths         → {@link px} / {@link num}
 */

const NAMED_COLORS = new Set([
  'transparent',
  'black',
  'white',
  'red',
  'green',
  'blue',
  'gray',
  'grey',
  'silver',
  'navy',
  'maroon',
  'orange',
  'purple',
  'teal',
  'yellow',
  'olive',
  'lime',
  'aqua',
  'fuchsia',
]);

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CHANNEL = String.raw`\s*(?:\d{1,3}(?:\.\d+)?%?)\s*`;
const ALPHA = String.raw`\s*(?:0|1|0?\.\d+|\d{1,3}%)\s*`;
const RGB_COLOR = new RegExp(`^rgba?\\(${CHANNEL},${CHANNEL},${CHANNEL}(?:,${ALPHA})?\\)$`, 'i');

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
]);
const FAMILY_NAME = /^[\p{L}\p{N} _.-]+$/u;

/** Values that must never reach a style attribute, whatever else they contain. */
const FORBIDDEN_CSS = /expression\s*\(|url\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding/i;

/**
 * Sanitises a single CSS value so it can sit inside a double-quoted
 * `style` attribute without ending the attribute, the declaration or
 * the rule.
 *
 * - Double quotes become single quotes (font names keep working).
 * - `;`, `{`, `}`, `<`, `>`, `\`, `&` and line breaks are removed —
 *   none of them belong in the values our blocks emit, and `&` / `\`
 *   are the entity / CSS-escape vectors for smuggling a `;` back in.
 * - Comment markers are removed.
 * - Values containing `url(`, `expression(`, `javascript:` & co. are
 *   dropped entirely (returns an empty string).
 */
export function cssValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'number' ? formatNumber(value) : String(value);
  const cleaned = raw
    .replace(/"/g, "'")
    .replace(/\/\*|\*\//g, '')
    .replace(/[;{}<>\\&]/g, '')
    .replace(/\p{Cc}/gu, '')
    .trim();
  if (FORBIDDEN_CSS.test(cleaned)) return '';
  return cleaned;
}

/**
 * Returns `value` when it is a colour we know how to ship safely
 * (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()` or one of
 * a short list of named colours); otherwise `fallback`.
 */
export function safeColor(value: unknown, fallback = '#000000'): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (HEX_COLOR.test(v)) return v.toLowerCase();
  if (RGB_COLOR.test(v)) return v.replace(/\s+/g, '');
  if (NAMED_COLORS.has(v.toLowerCase())) return v.toLowerCase();
  return fallback;
}

/**
 * Colour usable in a legacy `bgcolor` HTML attribute. Only 3/6-digit
 * hex survives the legacy colour parser intact (`rgb()`, 8-digit hex
 * and `transparent` are mangled or ignored), so anything else yields
 * `null` and callers should rely on the inline style alone.
 */
export function legacyColor(value: unknown): string | null {
  const c = safeColor(value, '');
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  return null;
}

/** ` bgcolor="#rrggbb"` (with leading space) or '' — see {@link legacyColor}. */
export function bgcolorAttr(value: unknown): string {
  const c = legacyColor(value);
  return c ? ` bgcolor="${c}"` : '';
}

/** Like {@link safeColor} but returns `null` instead of a fallback. */
export function parseColor(value: unknown): string | null {
  const sentinel = '\u0000';
  const out = safeColor(value, sentinel);
  return out === sentinel ? null : out;
}

/**
 * Normalises a `font-family` stack: each family is unquoted, validated
 * and re-quoted with SINGLE quotes when it contains a space, so the
 * result is safe inside a double-quoted style attribute. Stored
 * schemas that carry `"Trebuchet MS", sans-serif` are fixed at compile
 * time this way.
 */
export function fontStack(value: unknown, fallback = 'Arial, sans-serif'): string {
  if (typeof value !== 'string') return fallback;
  const families = value
    .split(',')
    .map((part) => part.trim().replace(/^['"]+|['"]+$/g, '').trim())
    .filter((name) => name.length > 0 && FAMILY_NAME.test(name))
    .map((name) => {
      if (GENERIC_FAMILIES.has(name.toLowerCase())) return name.toLowerCase();
      return /\s/.test(name) ? `'${name}'` : name;
    });
  return families.length > 0 ? families.join(', ') : fallback;
}

/**
 * Full HTML attribute-context escaping (`&`, `<`, `>`, `"`, `'`).
 */
export function attr(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Text-content escaping. Same character set as {@link attr} so either
 * is safe in either context.
 */
export function escapeHtml(value: unknown): string {
  return attr(value);
}

/**
 * Coerces `value` to a finite number clamped to `[min, max]`, rounded
 * to two decimals. Non-numeric input yields `fallback`.
 */
export function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

/**
 * Pixel length clamp. Returns a number (callers append `px`).
 */
export function px(value: unknown, min = 0, max = 4000, fallback = 0): number {
  return num(value, min, max, fallback);
}

/** Integer pixel clamp — for HTML `width` / `height` attributes. */
export function intPx(value: unknown, min = 0, max = 4000, fallback = 0): number {
  return Math.round(num(value, min, max, fallback));
}

/**
 * `Padding` → `top right bottom left` shorthand (`0` when absent).
 */
export function paddingCss(p?: Padding | null): string {
  if (!p) return '0';
  return `${px(p.top, 0, 400)}px ${px(p.right, 0, 400)}px ${px(p.bottom, 0, 400)}px ${px(p.left, 0, 400)}px`;
}

/** Horizontal padding sum (left + right), clamped like {@link paddingCss}. */
export function horizontalPadding(p?: Padding | null): number {
  if (!p) return 0;
  return px(p.left, 0, 400) + px(p.right, 0, 400);
}

const FONT_WEIGHT = /^(?:normal|bold|bolder|lighter|[1-9]00)$/;

/** Validated `font-weight` value (defaults to 400). */
export function fontWeight(value: unknown, fallback: number | string = 400): string {
  const v = String(value ?? '').trim();
  return FONT_WEIGHT.test(v) ? v : String(fallback);
}

/** Validated `text-align` value (defaults to left). */
export function textAlign(value: unknown, fallback = 'left'): string {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'left' || v === 'center' || v === 'right' || v === 'justify' ? v : fallback;
}

/** Validated border style keyword. */
export function borderStyle(value: unknown, fallback = 'solid'): string {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'solid' || v === 'dashed' || v === 'dotted' || v === 'double' ? v : fallback;
}

export type StyleDeclarations = Record<string, string | number | null | undefined | false>;

/**
 * Serialises a declaration map into an inline-style string
 * (`a:b;c:d`). Keys may be camelCase, snake_case or kebab-case; every
 * value goes through {@link cssValue}, and empty / null / undefined /
 * false values are skipped. The output contains no `"` `<` `>` `&`,
 * so it can be dropped verbatim into a double-quoted `style` attribute.
 */
export function inlineStyle(decls: StyleDeclarations): string {
  const out: string[] = [];
  for (const [key, raw] of Object.entries(decls)) {
    if (raw === undefined || raw === null || raw === false || raw === '') continue;
    const prop = cssProperty(key);
    if (!prop) continue;
    const value = cssValue(raw);
    if (value === '') continue;
    out.push(`${prop}:${value}`);
  }
  return out.join(';');
}

function cssProperty(key: string): string {
  const kebab = key
    .replace(/_/g, '-')
    .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    .toLowerCase();
  return /^-?[a-z][a-z0-9-]*$/.test(kebab) ? kebab : '';
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}
