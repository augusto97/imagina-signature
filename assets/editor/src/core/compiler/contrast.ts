import {
  colorFromBackgroundShorthand,
  composite,
  contrastRatio,
  parseCssColor,
  toHex,
  type Rgba,
} from './color';
import {
  fontSizeToPx,
  parseAttributes,
  parseStyle,
  stripImportant,
  styleValue,
  walkHtml,
} from './html-tokens';
import { parseBlockMarkerComment, type BlockRef } from './issues';
import { decodeEntities } from './urls';

/**
 * Text-contrast analysis of compiled email markup.
 *
 * Walks the document with an element stack and, for every visible run
 * of text, compares the inherited text colour with its EFFECTIVE
 * background: the nearest ancestor background the compiler emitted —
 * a block box, a container column, a button cell, the canvas shell —
 * composited when semi-transparent, falling back to white (the
 * client's message background).
 *
 * Thresholds follow WCAG 2.x AA: 4.5:1 for normal text, 3:1 for large
 * text (≥ 18 px, or bold and ≥ 14 px).
 *
 * Text is attributed to the innermost block via the compile-time block
 * markers (`<!--imgsig-block:type:id-->` … `<!--/imgsig-block-->`) that
 * `compileBlock()` emits while `CompileContext.markBlocks` is set.
 * Markup inside Outlook-only conditional comments (VML) is skipped.
 */

export interface ContrastFinding {
  block: BlockRef | null;
  /** `#rrggbb` of the text. */
  color: string;
  /** `#rrggbb` of the effective background. */
  background: string;
  ratio: number;
  /** Minimum ratio for this size / weight. */
  required: number;
  /** Font size in px (DEFAULT_FONT_SIZE when nothing declares one). */
  fontSize: number;
  bold: boolean;
  /** First characters of the offending text. */
  sample: string;
}

/** Assumed size when no ancestor declares one (typical webmail default). */
export const DEFAULT_FONT_SIZE = 14;

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/** Minimum WCAG AA contrast for text of this size and weight. */
export function contrastThreshold(fontSizePx: number, bold: boolean): number {
  return fontSizePx >= 18 || (bold && fontSizePx >= 14) ? 3 : 4.5;
}

/** Whether `fg` on `bg` meets {@link contrastThreshold}. Unparseable colours pass. */
export function meetsContrast(fg: string, bg: string, fontSizePx: number, bold = false): boolean {
  const f = parseCssColor(fg);
  const b = parseCssColor(bg);
  if (!f || !b) return true;
  const base = composite(b, WHITE);
  return contrastRatio(composite(f, base), base) >= contrastThreshold(fontSizePx, bold);
}

interface Frame {
  color: Rgba;
  bg: Rgba;
  fontSize: number | null;
  bold: boolean;
  hidden: boolean;
}

const HIDDEN_TAGS = new Set(['head', 'style', 'script', 'title', 'xml', 'template', 'noscript']);
const BOLD_TAGS = new Set(['b', 'strong', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function parseWeight(value: string): boolean | null {
  const v = stripImportant(value).toLowerCase();
  if (v === 'bold' || v === 'bolder') return true;
  if (v === 'normal' || v === 'lighter') return false;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n >= 600 : null;
}

export function findLowContrastText(html: string): ContrastFinding[] {
  const findings: ContrastFinding[] = [];
  const seen = new Set<string>();
  const blocks: Array<BlockRef | null> = [];

  const root: Frame = { color: BLACK, bg: WHITE, fontSize: null, bold: false, hidden: false };

  walkHtml<Frame>(html, root, {
    onOpen(token, parent) {
      const frame: Frame = { ...parent };
      if (HIDDEN_TAGS.has(token.name)) frame.hidden = true;
      if (BOLD_TAGS.has(token.name)) frame.bold = true;

      const attrs = parseAttributes(token.attrs);
      const bgAttr = parseCssColor(attrs.get('bgcolor'));
      if (bgAttr && bgAttr.a > 0) frame.bg = composite(bgAttr, parent.bg);
      if (token.name === 'font') {
        const c = parseCssColor(attrs.get('color'));
        if (c) frame.color = c;
      }

      const style = attrs.get('style');
      if (style) {
        const decls = parseStyle(decodeEntities(style));
        const bgColor = styleValue(decls, 'background-color');
        const bgShort = styleValue(decls, 'background');
        const bg =
          (bgColor !== null ? parseCssColor(bgColor) : null) ??
          (bgShort !== null ? colorFromBackgroundShorthand(bgShort) : null);
        if (bg && bg.a > 0) frame.bg = composite(bg, parent.bg);

        const color = styleValue(decls, 'color');
        const parsed = color !== null ? parseCssColor(color) : null;
        if (parsed) frame.color = parsed;

        const size = styleValue(decls, 'font-size');
        if (size !== null)
          frame.fontSize = fontSizeToPx(size, parent.fontSize ?? DEFAULT_FONT_SIZE);

        const weight = styleValue(decls, 'font-weight');
        const bold = weight !== null ? parseWeight(weight) : null;
        if (bold !== null) frame.bold = bold;

        const display = styleValue(decls, 'display');
        const visibility = styleValue(decls, 'visibility');
        const opacity = styleValue(decls, 'opacity');
        if (
          (display !== null && stripImportant(display).toLowerCase() === 'none') ||
          (visibility !== null && stripImportant(visibility).toLowerCase() === 'hidden') ||
          (opacity !== null && Number.parseFloat(opacity) === 0) ||
          frame.fontSize === 0
        ) {
          frame.hidden = true;
        }
      }
      return frame;
    },

    onToken(token, frame) {
      if (token.kind === 'comment') {
        const marker = parseBlockMarkerComment(token.raw);
        if (marker === 'end') blocks.pop();
        else if (marker) blocks.push(marker);
        return undefined;
      }
      if (token.kind !== 'text' || frame.hidden) return undefined;
      const text = decodeEntities(token.raw).replace(/\s+/g, ' ').trim();
      if (text === '') return undefined;

      const fontSize = frame.fontSize ?? DEFAULT_FONT_SIZE;
      const fg = composite(frame.color, frame.bg);
      const ratio = contrastRatio(fg, frame.bg);
      const required = contrastThreshold(fontSize, frame.bold);
      if (ratio >= required) return undefined;

      const block = blocks.length > 0 ? blocks[blocks.length - 1]! : null;
      const color = toHex(fg);
      const background = toHex(frame.bg);
      const key = `${block?.id ?? ''}|${color}|${background}|${fontSize}|${frame.bold}`;
      if (seen.has(key)) return undefined;
      seen.add(key);
      findings.push({
        block,
        color,
        background,
        ratio,
        required,
        fontSize,
        bold: frame.bold,
        sample: text.length > 40 ? `${text.slice(0, 40)}…` : text,
      });
      return undefined;
    },
  });

  return findings;
}
