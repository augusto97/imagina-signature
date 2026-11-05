import {
  hslToRgb,
  parseCssColor,
  relativeLuminance,
  rgbToHsl,
  toHex,
  type Rgba,
} from '@/core/compiler/color';
import { extractBodyFragment } from '@/core/compiler/compile';
import {
  parseAttributes,
  parseStyle,
  removeAttribute,
  serializeStyle,
  setAttribute,
  setStyleAttribute,
  stripImportant,
  tokenizeHtml,
} from '@/core/compiler/html-tokens';
import { attr } from '@/core/compiler/css';

/**
 * Preview transforms — pure functions taking the compiled HTML document
 * and returning what a given client would roughly render. They are
 * APPROXIMATIONS for the Preview modal: real cross-client QA still
 * belongs in the real clients (CLAUDE.md §20.3).
 */

export type PreviewClient = 'gmail' | 'outlook' | 'apple';
export type PreviewDarkMode = 'off' | 'full' | 'partial';
export type MobileBehaviour = 'scale' | 'overflow';

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

/** Removes `<head>` (title, metas, mso settings) and every `<style>` / `<link>` / `<script>`. */
export function stripHeadAndStyles(html: string): string {
  return html
    .replace(/<head[\s>][\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s>][\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, '');
}

/** Drops `<img>` elements whose source is a data: URI (Gmail never shows them). */
export function removeDataImages(html: string): string {
  return html.replace(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => {
    const src = parseAttributes(tag.slice(4, -1)).get('src') ?? '';
    return /^\s*data:/i.test(src) ? '' : tag;
  });
}

/** Gmail (web and apps): no `<head>`, no `<style>`, no data: images. */
export function toGmailView(html: string): string {
  return removeDataImages(stripHeadAndStyles(html));
}

// ---------------------------------------------------------------------------
// Outlook for Windows (Word rendering engine)
// ---------------------------------------------------------------------------

/**
 * Stylesheet approximating Word's HTML engine: no border-radius, no
 * max-width, no inline-block (divs become blocks, inline elements stay
 * inline — width / height / padding on them are lost), no background
 * images, and `mso-hide:all` honoured. The VML button stand-ins keep
 * their (inline, !important) radius: VML does round corners.
 */
export const OUTLOOK_DESKTOP_CSS = [
  '*{border-radius:0 !important;max-width:none !important;background-image:none !important}',
  'div[style*="inline-block"]{display:block !important}',
  'span[style*="inline-block"],a[style*="inline-block"],img[style*="inline-block"]{display:inline !important}',
  '[style*="mso-hide:all"]{display:none !important}',
].join('\n');

function conditionTargetsOutlook(condition: string): boolean {
  const c = condition.replace(/\s+/g, ' ').trim().toLowerCase();
  if (/!\s*\(?\s*mso/.test(c)) return false;
  return /\bmso\b/.test(c);
}

/**
 * Evaluates Outlook conditional comments the way Outlook does:
 * `<!--[if mso]>X<![endif]-->` → X; downlevel-revealed
 * `<!--[if !mso]><!-->X<!--<![endif]-->` → removed. Other conditions
 * (IE…) are dropped. `<xml>` islands (Office settings) are removed so
 * the browser does not print their text.
 */
export function revealMsoConditionals(html: string): string {
  const revealed = html.replace(
    /<!--\[if ([^\]]+)\]><!--(?:\s*--)?>([\s\S]*?)<!--<!\[endif\]-->/gi,
    (_m, cond: string, content: string) => (conditionTargetsOutlook(cond) ? content : ''),
  );
  const hidden = revealed.replace(
    /<!--\[if ([^\]]+)\]>([\s\S]*?)<!\[endif\]-->/gi,
    (_m, cond: string, content: string) => (conditionTargetsOutlook(cond) ? content : ''),
  );
  return hidden.replace(/<xml\b[\s\S]*?<\/xml>/gi, '');
}

function styleNumber(style: string, prop: string): number | null {
  const v = parseStyle(style).find((d) => d.prop === prop)?.value;
  if (!v) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Replaces each VML `<v:roundrect>` / `<v:rect>` (bullet-proof button)
 * with an HTML box of the VML shape's size and colours, so the preview
 * shows the button exactly as large as Outlook draws it.
 */
export function vmlToHtml(html: string): string {
  return html
    .replace(
      /<v:(roundrect|rect)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/v:\1>/gi,
      (_m, shape: string, attrs: string, inner: string) => {
        const a = parseAttributes(attrs);
        const style = a.get('style') ?? '';
        const width = styleNumber(style, 'width');
        const height = styleNumber(style, 'height');
        const fill = parseCssColor(a.get('fillcolor'));
        const stroked = !/^(f|false)$/i.test(a.get('stroke') ?? 't');
        const strokeColor = parseCssColor(a.get('strokecolor')) ?? { r: 0, g: 0, b: 0, a: 1 };
        const arc = Number.parseFloat(a.get('arcsize') ?? '0');
        // VML arcsize: % of half the shorter side.
        const radius =
          shape.toLowerCase() === 'roundrect' && width && height && Number.isFinite(arc)
            ? Math.round((Math.min(width, height) / 2) * (arc / 100))
            : 0;
        const box = [
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'box-sizing:border-box',
          width ? `width:${width}px` : '',
          height ? `height:${height}px` : '',
          fill ? `background-color:${toHex(fill)}` : '',
          stroked ? `border:1px solid ${toHex(strokeColor)}` : '',
          `border-radius:${radius}px !important`,
          'text-decoration:none',
        ]
          .filter(Boolean)
          .join(';');
        const content = inner
          .replace(/<w:anchorlock\s*\/?>(?:<\/w:anchorlock>)?/gi, '')
          .replace(/<v:textbox\b[^>]*>|<\/v:textbox>/gi, '');
        // Raw attribute value: already entity-encoded, only `"` can need escaping.
        const href = a.get('href');
        const tag = href ? `a href="${href.replace(/"/g, '&quot;')}"` : 'span';
        return `<${tag} data-imgsig-vml="${attr(shape.toLowerCase())}" style="${box}">${content}</${href ? 'a' : 'span'}>`;
      },
    )
    .replace(/<\/?[vwo]:[^>]*>/gi, '');
}

/** Removes legacy `background="…"` image attributes (Outlook needs VML for those). */
export function stripBackgroundAttributes(html: string): string {
  return html.replace(/<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (tag) =>
    /\sbackground\s*=/i.test(tag) ? removeAttribute(tag, 'background') : tag,
  );
}

/** Outlook for Windows (classic): conditionals evaluated, VML drawn, Word stylesheet applied. */
export function toOutlookDesktopView(html: string): string {
  const doc = stripBackgroundAttributes(vmlToHtml(revealMsoConditionals(html)));
  const style = `<style data-imgsig-preview="outlook">${OUTLOOK_DESKTOP_CSS}</style>`;
  return /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, `${style}</head>`) : `${style}${doc}`;
}

/** Apple Mail renders the document as-is. */
export function toAppleMailView(html: string): string {
  return html;
}

/**
 * `outlook` on a phone or tablet means the Outlook APP, which does not
 * use Word: it renders the HTML like a browser.
 */
export function clientView(client: PreviewClient, html: string, mobile = false): string {
  switch (client) {
    case 'gmail':
      return toGmailView(html);
    case 'outlook':
      return mobile ? html : toOutlookDesktopView(html);
    default:
      return toAppleMailView(html);
  }
}

// ---------------------------------------------------------------------------
// Dark mode simulations
// ---------------------------------------------------------------------------

/**
 * Full inversion (Gmail iOS, Outlook apps): everything is inverted and
 * hue-rotated back, except images, which are inverted twice (= intact).
 * Applied to the preview's chrome wrapper, not `<body>`, so the page
 * background is inverted too.
 */
export const FULL_INVERSION_CSS = [
  '.imgsig-preview-chrome{filter:invert(1) hue-rotate(180deg)}',
  '.imgsig-preview-chrome img,.imgsig-preview-chrome video{filter:invert(1) hue-rotate(180deg)}',
].join('\n');

/** Light background → dark equivalent (same hue). */
export function darkenBackground(c: Rgba): Rgba {
  const hsl = rgbToHsl(c);
  return hslToRgb({ h: hsl.h, s: hsl.s, l: 0.08 + (1 - hsl.l) * 0.5 }, c.a);
}

/** Dark text → light equivalent (same hue). */
export function lightenText(c: Rgba): Rgba {
  const hsl = rgbToHsl(c);
  return hslToRgb({ h: hsl.h, s: hsl.s, l: Math.min(0.9, Math.max(0.72, 1 - hsl.l)) }, c.a);
}

const LIGHT_BACKGROUND = 0.5;
const DARK_TEXT = 0.2;

function remap(value: string, kind: 'bg' | 'text'): string | null {
  const c = parseCssColor(value);
  if (!c || c.a === 0) return null;
  const lum = relativeLuminance(c);
  if (kind === 'bg' && lum > LIGHT_BACKGROUND) return toHex(darkenBackground(c));
  if (kind === 'text' && lum < DARK_TEXT) return toHex(lightenText(c));
  return null;
}

/**
 * Partial dark mode (Outlook.com, Apple Mail): LIGHT backgrounds are
 * darkened and dark text lightened; dark backgrounds, light text and
 * images are left as they are — which is exactly how a dark logo on a
 * transparent background ends up invisible.
 */
export function applyPartialDarkMode(html: string): string {
  return tokenizeHtml(html)
    .map((token) => {
      if (token.kind !== 'open') return token.raw;
      let tag = token.raw;
      const attrs = parseAttributes(token.attrs);

      const bgcolor = attrs.get('bgcolor');
      const bgAttr = bgcolor ? remap(bgcolor, 'bg') : null;
      if (bgAttr) tag = setAttribute(tag, 'bgcolor', bgAttr);
      if (token.name === 'font') {
        const fontColor = attrs.get('color');
        const next = fontColor ? remap(fontColor, 'text') : null;
        if (next) tag = setAttribute(tag, 'color', next);
      }

      const style = attrs.get('style');
      if (style) {
        let changed = false;
        const decls = parseStyle(style).map((d) => {
          const important = /!\s*important\s*$/i.test(d.value) ? ' !important' : '';
          const value = stripImportant(d.value);
          if (d.prop === 'background-color' || d.prop === 'color') {
            const next = remap(value, d.prop === 'color' ? 'text' : 'bg');
            if (next) {
              changed = true;
              return { prop: d.prop, value: `${next}${important}` };
            }
          } else if (d.prop === 'background') {
            const next = value.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\b[a-z]+\b/gi, (part) => {
              const mapped = remap(part, 'bg');
              if (mapped) changed = true;
              return mapped ?? part;
            });
            return { prop: d.prop, value: `${next}${important}` };
          }
          return d;
        });
        if (changed) tag = setStyleAttribute(tag, serializeStyle(decls));
      }
      return tag;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Mobile
// ---------------------------------------------------------------------------

/**
 * What each client typically does with a message wider than the
 * screen: Gmail's apps and iOS Mail shrink it to fit; the Outlook app
 * keeps its size and scrolls sideways.
 */
export function mobileBehaviour(client: PreviewClient): MobileBehaviour {
  return client === 'outlook' ? 'overflow' : 'scale';
}

/**
 * Zoom factor for the message content: below 1 only when the content
 * is fixed-width, wider than the space available and the client scales
 * to fit. Fluid signatures reflow instead.
 */
export function mobileScale(
  contentWidth: number,
  availableWidth: number,
  behaviour: MobileBehaviour,
  fluid: boolean,
): number {
  if (fluid || behaviour !== 'scale' || contentWidth <= 0 || contentWidth <= availableWidth)
    return 1;
  return Math.max(0.1, Math.floor((availableWidth / contentWidth) * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// Preview document
// ---------------------------------------------------------------------------

const CHROME: Record<PreviewClient, { font: string; light: string; dark: string; text: string }> = {
  gmail: { font: 'Roboto,Arial,sans-serif', light: '#f6f8fc', dark: '#1f1f1f', text: '#e3e3e3' },
  outlook: {
    font: "'Segoe UI',Arial,sans-serif",
    light: '#ffffff',
    dark: '#292929',
    text: '#e6e6e6',
  },
  apple: {
    font: '-apple-system,BlinkMacSystemFont,sans-serif',
    light: '#ffffff',
    dark: '#1e1e1e',
    text: '#e5e5e5',
  },
};

export interface PreviewDocumentOptions {
  /** Complete compiled document (`CompileResult.html`). */
  html: string;
  client: PreviewClient;
  darkMode: PreviewDarkMode;
  /** Width of the simulated viewport (the iframe), px. */
  viewportWidth: number;
  /** Width of the signature shell (`CompileResult.width`). */
  contentWidth: number;
  /** Whether the shell is fluid (`CompileResult.fluid`). */
  fluid: boolean;
  /** Phone / tablet: client app behaviour and tighter chrome padding. */
  mobile: boolean;
}

/** `<style>` blocks of a document outside comments (Outlook-only styles stay hidden). */
function collectStyles(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  return (withoutComments.match(/<style[\s>][\s\S]*?<\/style>/gi) ?? []).join('');
}

/**
 * The `srcdoc` of the preview iframe: the client view of the compiled
 * document (optionally dark-mode transformed) inside a client "chrome"
 * wrapper, scaled or scrollable according to the client's mobile
 * behaviour.
 */
export function buildPreviewDocument(options: PreviewDocumentOptions): string {
  const { client, darkMode, viewportWidth, contentWidth, fluid, mobile } = options;
  let doc = clientView(client, options.html, mobile);
  if (darkMode === 'partial') doc = applyPartialDarkMode(doc);

  const styles = collectStyles(doc);
  const body = extractBodyFragment(doc.replace(/<head[\s>][\s\S]*?<\/head>/i, ''));

  const chrome = CHROME[client];
  const padding = mobile ? 8 : 24;
  const behaviour = mobile ? mobileBehaviour(client) : 'overflow';
  const scale = mobileScale(contentWidth, viewportWidth - padding * 2, behaviour, fluid);
  const partial = darkMode === 'partial';

  const chromeStyle = [
    `background:${partial ? chrome.dark : chrome.light}`,
    `color:${partial ? chrome.text : '#222222'}`,
    `font-family:${chrome.font}`,
    `padding:${padding}px`,
    'min-height:100vh',
    'box-sizing:border-box',
    behaviour === 'overflow' ? 'overflow-x:auto' : 'overflow-x:hidden',
  ].join(';');
  const mailStyle = scale < 1 ? `zoom:${scale}` : '';

  const baseCss = 'html,body{margin:0;padding:0}';
  const darkCss = darkMode === 'full' ? FULL_INVERSION_CSS : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>${baseCss}\n${darkCss}</style>${styles}</head><body><div class="imgsig-preview-chrome" style="${chromeStyle}"><div class="imgsig-preview-mail"${mailStyle ? ` style="${mailStyle}"` : ''}>${body}</div></div></body></html>`;
}
