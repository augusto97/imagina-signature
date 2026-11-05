/**
 * Minimal tokenizer for the compiler's own email markup — shared by the
 * global passes that need to know which element a declaration sits in
 * (line-height normalisation, contrast analysis, alt enforcement, image
 * collection) and by the preview transforms.
 *
 * It is NOT a general HTML parser. It relies on what the compiler
 * guarantees: quoted attribute values, no raw `<` inside attributes
 * (everything passes through `css.ts`), well-nested tables. Comments —
 * Outlook conditionals included — are single opaque tokens, so markup
 * that only Outlook sees (`<!--[if mso]>…<![endif]-->`) never unbalances
 * the element stack. Downlevel-revealed conditionals
 * (`<!--[if !mso]><!-->…<!--<![endif]-->`) are two short comments with
 * ordinary markup between them, which is what every non-Outlook client
 * renders.
 */

export type HtmlToken =
  | { kind: 'text'; raw: string }
  | { kind: 'comment'; raw: string }
  | { kind: 'other'; raw: string }
  | { kind: 'open'; raw: string; name: string; attrs: string; selfClosing: boolean }
  | { kind: 'close'; raw: string; name: string };

const TOKEN_RE =
  /<!--[\s\S]*?-->|<![^>]*>|<\?[\s\S]*?\?>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;

/** Elements that never have a closing tag. */
export const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export function tokenizeHtml(html: string): HtmlToken[] {
  const out: HtmlToken[] = [];
  for (const m of html.matchAll(TOKEN_RE)) {
    const raw = m[0];
    if (raw.startsWith('<!--')) {
      out.push({ kind: 'comment', raw });
    } else if (raw.startsWith('<!') || raw.startsWith('<?')) {
      out.push({ kind: 'other', raw });
    } else if (m[1] !== undefined) {
      out.push({ kind: 'close', raw, name: m[1].toLowerCase() });
    } else if (m[2] !== undefined) {
      const attrs = m[3] ?? '';
      out.push({
        kind: 'open',
        raw,
        name: m[2].toLowerCase(),
        attrs,
        selfClosing: /\/\s*$/.test(attrs),
      });
    } else {
      out.push({ kind: 'text', raw });
    }
  }
  return out;
}

/** Whether an open tag pushes an element that a later close tag pops. */
export function opensElement(token: Extract<HtmlToken, { kind: 'open' }>): boolean {
  return !token.selfClosing && !VOID_ELEMENTS.has(token.name);
}

/**
 * Generic element-stack walker. `onOpen` returns the frame pushed for
 * the element (derived from the parent frame); `onToken` sees every
 * token with the frame it belongs to and returns its replacement text
 * (or `undefined` to keep it).
 */
export function walkHtml<F>(
  html: string,
  root: F,
  handlers: {
    onOpen: (token: Extract<HtmlToken, { kind: 'open' }>, parent: F) => F;
    onToken?: (token: HtmlToken, frame: F) => string | undefined;
  },
): string {
  const stack: Array<{ name: string; frame: F }> = [{ name: '#root', frame: root }];
  const parts: string[] = [];
  for (const token of tokenizeHtml(html)) {
    const parent = stack[stack.length - 1]!.frame;
    let frame = parent;
    if (token.kind === 'open') {
      frame = handlers.onOpen(token, parent);
      if (opensElement(token)) stack.push({ name: token.name, frame });
    }
    const replaced = handlers.onToken?.(token, frame);
    parts.push(replaced ?? token.raw);
    if (token.kind === 'close') {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.name === token.name) {
          stack.length = i;
          break;
        }
      }
    }
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Lower-cased attribute name → raw (still entity-encoded) value. First wins. */
export function parseAttributes(attrs: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of attrs.matchAll(ATTR_RE)) {
    const name = m[1]!.toLowerCase();
    if (name === '/') continue;
    if (!map.has(name)) map.set(name, m[2] ?? m[3] ?? m[4] ?? '');
  }
  return map;
}

/**
 * Returns `tag` with its `style` attribute replaced by `style` (added
 * when missing, removed when `style` is empty). `style` must already be
 * safe inside double quotes.
 */
export function setStyleAttribute(tag: string, style: string): string {
  const re = /(\s)style\s*=\s*(?:"[^"]*"|'[^']*')/i;
  if (re.test(tag)) {
    return style === '' ? tag.replace(re, '') : tag.replace(re, `$1style="${style}"`);
  }
  if (style === '') return tag;
  return tag.replace(/^<([a-zA-Z][\w:-]*)/, `<$1 style="${style}"`);
}

/** Returns `tag` with attribute `name` set to `value` (added when missing). */
export function setAttribute(tag: string, name: string, value: string): string {
  const re = new RegExp(`(\\s)${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+)`, 'i');
  if (re.test(tag)) return tag.replace(re, `$1${name}="${value}"`);
  return tag.replace(/^<([a-zA-Z][\w:-]*)/, `<$1 ${name}="${value}"`);
}

/** Returns `tag` without attribute `name`. */
export function removeAttribute(tag: string, name: string): string {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+)`, 'gi');
  return tag.replace(re, '');
}

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

export interface StyleDeclaration {
  /** Lower-cased property name. */
  prop: string;
  /** Trimmed value (may still carry `!important`). */
  value: string;
}

/** Splits an inline style into declarations (`;` inside parens / quotes kept). */
export function parseStyle(style: string): StyleDeclaration[] {
  const out: StyleDeclaration[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  const push = (chunk: string): void => {
    const idx = chunk.indexOf(':');
    if (idx <= 0) return;
    const prop = chunk.slice(0, idx).trim().toLowerCase();
    const value = chunk.slice(idx + 1).trim();
    if (prop !== '' && value !== '') out.push({ prop, value });
  };
  for (let i = 0; i < style.length; i++) {
    const c = style[i]!;
    if (c === '&') {
      // Character references (`&quot;`, `&#39;`) end in `;` — never a separator.
      const entity = /^&(?:#\d+|#x[0-9a-f]+|[a-z]+\d*);/i.exec(style.slice(i, i + 12));
      if (entity) {
        i += entity[0].length - 1;
        continue;
      }
    }
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
    } else if (c === ';' && depth === 0) {
      push(style.slice(start, i));
      start = i + 1;
    }
  }
  push(style.slice(start));
  return out;
}

export function serializeStyle(decls: StyleDeclaration[]): string {
  return decls.map((d) => `${d.prop}:${d.value}`).join(';');
}

/** Value of the LAST declaration of `prop` (the one that wins), or null. */
export function styleValue(decls: StyleDeclaration[], prop: string): string | null {
  for (let i = decls.length - 1; i >= 0; i--) {
    if (decls[i]!.prop === prop) return decls[i]!.value;
  }
  return null;
}

/** Strips a trailing `!important`. */
export function stripImportant(value: string): string {
  return value.replace(/\s*!\s*important\s*$/i, '').trim();
}

/**
 * Resolves a CSS `font-size` to px. Relative units resolve against
 * `parentPx`; keywords and unknown units return null.
 */
export function fontSizeToPx(value: string, parentPx: number | null): number | null {
  const v = stripImportant(value).toLowerCase();
  const m = /^(-?\d*\.?\d+)(px|pt|em|rem|%)?$/.exec(v);
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  if (!Number.isFinite(n) || n < 0) return null;
  switch (m[2]) {
    case 'px':
      return n;
    case 'pt':
      return (n * 4) / 3;
    case 'rem':
      return n * 16;
    case 'em':
      return parentPx === null ? null : n * parentPx;
    case '%':
      return parentPx === null ? null : (n / 100) * parentPx;
    default:
      return n === 0 ? 0 : null;
  }
}

/** Rounds to two decimals and drops trailing zeros (`18.2`, `21`). */
export function formatPx(n: number): string {
  return String(Math.round(n * 100) / 100);
}
