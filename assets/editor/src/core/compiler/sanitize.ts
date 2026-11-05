import { attr, escapeHtml, parseColor } from './css';

/**
 * Browser-side sanitiser for Tiptap-produced HTML, scoped to the
 * email-safe allowlist (CLAUDE.md §19.4).
 *
 * Runs on the canvas (via `dangerouslySetInnerHTML` inside wp-admin)
 * AND at compile time, so it is a real security boundary, not a
 * formatting pass.
 *
 * Design — recursive, allowlist-based, output is RE-SERIALISED (we never
 * hand back the parsed DOM's own `innerHTML`):
 *
 *  - Allowed tags: strong, b, em, i, u, a, br, span, p.
 *  - `<a>`: `href` (http / https / mailto / tel, or a `{{variable}}`
 *    token that the compile-time URL pass re-validates after
 *    substitution), `title`, `target` (`_blank` only), `rel` (known
 *    tokens only).
 *  - `style`, each value validated and re-serialised:
 *      - `<span>` (Tiptap text-style marks): `color`, `font-size` (px),
 *        `letter-spacing` (px / normal), `text-transform`,
 *        `font-style`, `font-weight`, `text-decoration`;
 *      - `<p>` and the inline formatting tags: `color`, `font-weight`,
 *        `font-style`, `text-decoration`.
 *    Opaque `rgb()` colours are rewritten as `#rrggbb` (Tiptap's colour
 *    mark reads them back as rgb; old Outlook / Lotus prefer hex).
 *    Every other property is dropped.
 *  - Dangerous containers (script, style, iframe, object, embed, svg,
 *    math, form controls, link, meta, base, template, noscript, …) are
 *    dropped INCLUDING their contents.
 *  - Any other unknown tag is unwrapped, and its children are sanitised
 *    recursively — the previous implementation promoted the children of
 *    a disallowed tag WITHOUT re-checking them, so
 *    `<section><img src=x onerror=alert(1)></section>` came out as a
 *    live `<img onerror>`.
 *  - Every attribute not on the allowlist (including all `on*`
 *    handlers) is discarded.
 *
 * Email output tweaks applied here so canvas and export agree:
 *  - `<p>` always carries `margin:0` (Tailwind resets the canvas, but
 *    mail clients default to ~1em margins).
 *  - With `options.linkColor`, every `<a>` gets
 *    `color:<linkColor>;text-decoration:underline`.
 */

export interface SanitizeOptions {
  /** When set, links are emitted with this colour + underline. */
  linkColor?: string;
}

const ALLOWED_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 'a', 'br', 'span', 'p']);

/** CSS properties kept on `<p>` and the inline formatting tags. */
const BASE_STYLE_PROPS = ['color', 'font-weight', 'font-style', 'text-decoration'] as const;

/** CSS properties kept on `<span>` (rich-text colour / size / tracking marks). */
const SPAN_STYLE_PROPS = [
  ...BASE_STYLE_PROPS,
  'font-size',
  'letter-spacing',
  'text-transform',
] as const;

type StyleProp = (typeof SPAN_STYLE_PROPS)[number];

const STYLE_PROPS_BY_TAG: Record<string, ReadonlySet<StyleProp>> = {
  span: new Set(SPAN_STYLE_PROPS),
  p: new Set(BASE_STYLE_PROPS),
  strong: new Set(BASE_STYLE_PROPS),
  b: new Set(BASE_STYLE_PROPS),
  em: new Set(BASE_STYLE_PROPS),
  i: new Set(BASE_STYLE_PROPS),
  u: new Set(BASE_STYLE_PROPS),
};

/** Font sizes accepted inside rich text (px). */
export const RICH_TEXT_FONT_SIZE_MIN = 6;
export const RICH_TEXT_FONT_SIZE_MAX = 96;

/** Dropped together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'link',
  'meta',
  'base',
  'template',
  'noscript',
  'noembed',
  'noframes',
  'xmp',
  'plaintext',
  'title',
  'head',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'picture',
  'img',
  'image',
  'portal',
]);

const REL_TOKENS = new Set(['noopener', 'noreferrer', 'nofollow', 'ugc', 'sponsored']);
const VARIABLE_HREF = /^\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/;
const SAFE_SCHEME = /^(?:https?:|mailto:|tel:)/;

/**
 * True when `href` may be emitted as-is: http(s) / mailto / tel, or a
 * leading `{{variable}}` token (re-validated after substitution).
 *
 * Browsers strip ASCII tab / newline anywhere in a URL and C0 controls
 * + spaces at the ends, so `jav\tascript:` IS `javascript:`. We remove
 * every control / whitespace character before looking at the scheme —
 * fail-closed: anything that does not start with an allowed scheme
 * after normalisation is rejected.
 */
export function isSafeHref(href: string): boolean {
  const normalised = normaliseUrlForScheme(href);
  return SAFE_SCHEME.test(normalised) || VARIABLE_HREF.test(href.trim());
}

/** Lower-cased URL with every control / whitespace character removed. */
export function normaliseUrlForScheme(url: string): string {
  return url.replace(/[\p{Cc}\p{Z}\u00ad\u200b-\u200f\u2028\u2029\ufeff]/gu, '').toLowerCase();
}

export function sanitizeEmailHtml(html: string, options: SanitizeOptions = {}): string {
  if (!html) return '';
  const source = String(html);

  if (typeof DOMParser === 'undefined') {
    // No DOM available (SSR / exotic test runner): fail closed by
    // stripping every tag and escaping what is left.
    return escapeHtml(source.replace(/<[^>]*>/g, ''));
  }

  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><body>${source}</body>`, 'text/html');
  const linkStyle = options.linkColor
    ? `color:${parseColor(options.linkColor) ?? '#1d4ed8'};text-decoration:underline`
    : '';
  return serializeChildren(doc.body, linkStyle);
}

function serializeChildren(node: Node, linkStyle: string): string {
  let out = '';
  node.childNodes.forEach((child) => {
    out += serializeNode(child, linkStyle);
  });
  return out;
}

function serializeNode(node: Node, linkStyle: string): string {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return escapeText(node.nodeValue ?? '');
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) {
    // Comments, processing instructions, CDATA: dropped.
    return '';
  }

  const el = node as Element;
  const tag = el.localName.toLowerCase();

  // Anything outside the HTML namespace (svg / math descendants) is
  // dropped wholesale; their parents are already in DROP_WITH_CONTENT.
  if (el.namespaceURI && el.namespaceURI !== 'http://www.w3.org/1999/xhtml') return '';
  if (DROP_WITH_CONTENT.has(tag)) return '';
  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap: keep the (recursively sanitised) children only.
    return serializeChildren(el, linkStyle);
  }

  if (tag === 'br') return '<br>';

  const attrs = tag === 'a' ? linkAttributes(el, linkStyle) : styleAttribute(el, tag);
  return `<${tag}${attrs}>${serializeChildren(el, linkStyle)}</${tag}>`;
}

function linkAttributes(el: Element, linkStyle: string): string {
  let out = '';

  const href = el.getAttribute('href');
  if (href !== null && isSafeHref(href)) {
    out += ` href="${attr(stripUrlControls(href))}"`;
  }

  const title = el.getAttribute('title');
  if (title) out += ` title="${attr(title)}"`;

  const target = el.getAttribute('target');
  if (target !== null && target.trim().toLowerCase() === '_blank') out += ' target="_blank"';

  const rel = el.getAttribute('rel');
  if (rel) {
    const tokens = rel
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => REL_TOKENS.has(t));
    if (tokens.length > 0) out += ` rel="${attr(Array.from(new Set(tokens)).join(' '))}"`;
  }

  if (linkStyle) out += ` style="${linkStyle}"`;
  return out;
}

function styleAttribute(el: Element, tag: string): string {
  const decls: string[] = tag === 'p' ? ['margin:0'] : [];
  const allowed = STYLE_PROPS_BY_TAG[tag];
  if (allowed) {
    decls.push(...allowedDeclarations(el.getAttribute('style') ?? '', allowed));
  }
  return decls.length > 0 ? ` style="${decls.join(';')}"` : '';
}

const FONT_WEIGHT = /^(?:normal|bold|bolder|lighter|[1-9]00)$/;
const FONT_STYLE = /^(?:normal|italic|oblique)$/;
const TEXT_TRANSFORM = /^(?:none|uppercase|lowercase|capitalize)$/;
const PX_LENGTH = /^(-?\d{1,3}(?:\.\d+)?)px$/;
const DECORATION_TOKENS = new Set(['none', 'underline', 'line-through', 'overline']);

/**
 * Parses an inline `style` attribute and returns only the declarations
 * whose property is in `allowed`, each re-serialised from a validated
 * value (anything that doesn't validate is dropped).
 */
function allowedDeclarations(style: string, allowed: ReadonlySet<StyleProp>): string[] {
  const out = new Map<string, string>();
  for (const chunk of style.split(';')) {
    const idx = chunk.indexOf(':');
    if (idx <= 0) continue;
    let prop = chunk.slice(0, idx).trim().toLowerCase();
    if (prop === 'text-decoration-line') prop = 'text-decoration';
    if (!allowed.has(prop as StyleProp)) continue;
    const value = chunk
      .slice(idx + 1)
      .replace(/!important/gi, '')
      .trim()
      .toLowerCase();
    if (!value) continue;
    const clean = validValue(prop as StyleProp, value);
    if (clean !== null) out.set(prop, clean);
  }
  return Array.from(out, ([k, v]) => `${k}:${v}`);
}

function validValue(prop: StyleProp, value: string): string | null {
  switch (prop) {
    case 'color': {
      const color = parseColor(value);
      return color ? rgbToHex(color) : null;
    }
    case 'font-weight':
      return FONT_WEIGHT.test(value) ? value : null;
    case 'font-style':
      return FONT_STYLE.test(value) ? value : null;
    case 'text-transform':
      return TEXT_TRANSFORM.test(value) ? value : null;
    case 'text-decoration': {
      const tokens = value.split(/\s+/).filter((t) => DECORATION_TOKENS.has(t));
      return tokens.length > 0 ? tokens.join(' ') : null;
    }
    case 'font-size': {
      const m = PX_LENGTH.exec(value);
      if (!m) return null;
      const n = Number(m[1]);
      return n >= RICH_TEXT_FONT_SIZE_MIN && n <= RICH_TEXT_FONT_SIZE_MAX ? `${n}px` : null;
    }
    case 'letter-spacing': {
      if (value === 'normal') return value;
      const m = PX_LENGTH.exec(value);
      if (!m) return null;
      const n = Number(m[1]);
      return n >= -5 && n <= 20 ? `${n}px` : null;
    }
    default:
      return null;
  }
}

/** `rgb(r,g,b)` / `rgba(r,g,b,1)` → `#rrggbb`; anything else unchanged. */
function rgbToHex(color: string): string {
  const m = /^rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})(?:,(1|1\.0+|100%))?\)$/.exec(color);
  if (!m) return color;
  const channels = [m[1], m[2], m[3]].map((c) => Math.min(255, Number(c)));
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Removes characters browsers ignore in URLs (tabs, newlines, …). */
function stripUrlControls(url: string): string {
  return url.replace(/\p{Cc}/gu, '').trim();
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\u00a0/g, '&nbsp;');
}
