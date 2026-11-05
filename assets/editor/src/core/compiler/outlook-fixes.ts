import {
  fontSizeToPx,
  formatPx,
  parseAttributes,
  parseStyle,
  serializeStyle,
  setStyleAttribute,
  stripImportant,
  styleValue,
  walkHtml,
  type StyleDeclaration,
} from './html-tokens';

/**
 * Outlook desktop quirks workarounds (CLAUDE.md §9.5).
 *
 *  - {@link normalizeLineHeights}: every inline `line-height` gets
 *    `mso-line-height-rule:exactly` right BEFORE it, and unitless
 *    line-heights become px (Word's engine adds its own leading
 *    otherwise, and mis-reads bare numbers).
 *  - An Outlook-only CSS reset (`<!--[if mso]><style>…`) before `<body>`.
 *
 * The VML bullet-proof button lives in the Button block itself.
 *
 * Returning the input unchanged when the document doesn't need a
 * fix keeps the function safe to apply unconditionally.
 */
export function applyOutlookFixes(html: string): string {
  const out = normalizeLineHeights(html);

  // Inject Outlook-specific CSS reset just inside <body>. Doing this
  // in <head> would require mutating the shell wrapper; injecting via
  // a conditional `<!--[if mso]>` block keeps non-Outlook clients
  // untouched.
  const msoReset = `<!--[if mso]>
<style type="text/css">
table { border-collapse: collapse; }
td, th { mso-line-height-rule: exactly; }
img { -ms-interpolation-mode: bicubic; }
</style>
<![endif]-->`;

  return out.replace('<body', `${msoReset}<body`);
}

interface LineHeightFrame {
  /** Computed font size in px, when an ancestor (or the element) declares one. */
  fontSize: number | null;
  /**
   * Unitless factor an ancestor declared that THIS pass turned into px.
   * Descendants would have inherited the factor (and multiplied it by
   * their own font size); after the conversion they inherit the px
   * value instead, so any descendant that sets its own font size gets
   * an explicit `line-height` of `fontSize × factor` to keep rendering
   * identical.
   */
  convertedFactor: number | null;
}

const UNITLESS = /^(-?\d*\.?\d+)$/;

/**
 * Typography pass for Outlook on Windows:
 *
 *  1. Every element whose inline style declares `line-height` gets
 *     `mso-line-height-rule:exactly` immediately before the (first)
 *     `line-height` declaration. Existing `mso-line-height-rule`
 *     declarations are moved there, never duplicated.
 *  2. Unitless line-heights (`line-height:1.4`) are converted to px
 *     using the element's computed font size when it is known (its own
 *     `font-size`, or the nearest ancestor's). Unknown font size → left
 *     as-is. `0` is left alone.
 *  3. Descendants that set their own font size below a converted
 *     ancestor receive the px line-height they would have computed
 *     from the inherited factor (see {@link LineHeightFrame}).
 *
 * Markup inside Outlook conditional comments is not touched.
 */
export function normalizeLineHeights(html: string): string {
  const root: LineHeightFrame = { fontSize: null, convertedFactor: null };
  // Replacement for the open tag currently being visited (onToken runs
  // right after onOpen for the same token).
  let pending: string | undefined;

  return walkHtml<LineHeightFrame>(html, root, {
    onOpen(token, parent) {
      pending = undefined;
      const style = parseAttributes(token.attrs).get('style');
      if (!style) return parent;

      const decls = parseStyle(style);
      const ownSizeValue = styleValue(decls, 'font-size');
      const ownSize =
        ownSizeValue !== null ? fontSizeToPx(ownSizeValue, parent.fontSize) : undefined;
      const fontSize = ownSize === undefined ? parent.fontSize : ownSize;
      const frame: LineHeightFrame = { fontSize, convertedFactor: parent.convertedFactor };

      const hasLineHeight = decls.some((d) => d.prop === 'line-height');
      let next: StyleDeclaration[] = decls;

      if (hasLineHeight) {
        frame.convertedFactor = null;
        next = decls.map((d) => {
          if (d.prop !== 'line-height') return d;
          const value = stripImportant(d.value);
          const m = UNITLESS.exec(value);
          if (!m) return d;
          const factor = Number.parseFloat(m[1]!);
          if (!Number.isFinite(factor) || factor === 0 || fontSize === null) return d;
          frame.convertedFactor = factor;
          const important = d.value !== value ? ' !important' : '';
          return { prop: d.prop, value: `${formatPx(fontSize * factor)}px${important}` };
        });
      } else if (parent.convertedFactor !== null && typeof ownSize === 'number' && ownSize > 0) {
        next = [
          ...decls,
          { prop: 'line-height', value: `${formatPx(ownSize * parent.convertedFactor)}px` },
        ];
      }

      if (!next.some((d) => d.prop === 'line-height')) return frame;

      const withoutRule = next.filter((d) => d.prop !== 'mso-line-height-rule');
      const first = withoutRule.findIndex((d) => d.prop === 'line-height');
      withoutRule.splice(first, 0, { prop: 'mso-line-height-rule', value: 'exactly' });
      const serialized = serializeStyle(withoutRule);
      if (serialized !== style) pending = setStyleAttribute(token.raw, serialized);
      return frame;
    },
    onToken(token) {
      return token.kind === 'open' ? pending : undefined;
    },
  });
}
