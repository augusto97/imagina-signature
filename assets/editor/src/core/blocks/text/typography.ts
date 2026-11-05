import type { CSSProperties } from 'react';
import type { CanvasConfig } from '@/core/schema/signature';
import type { FontWeight, TextAlign, TextStyle } from '@/core/schema/styles';
import {
  fontStack,
  fontWeight as validFontWeight,
  num,
  px,
  safeColor,
  textAlign as validTextAlign,
  type StyleDeclarations,
} from '@/core/compiler/css';

/**
 * Typography resolution shared by every text-like block (text, heading,
 * disclaimer, button label).
 *
 * A block's {@link TextStyle} may leave `font_family`, `font_size` and
 * `color` unset; they then inherit from the canvas. The SAME resolver
 * feeds the canvas renderer (React style object) and the compiler
 * (inline declarations), so what the editor shows is what ships.
 *
 * Inherited sizes are scaled per block type (`sizeScale`), which keeps
 * a heading proportionally larger — and a disclaimer smaller — than the
 * canvas default: at the stock 14px canvas size the inherited values
 * are 14 (text / button), 18 (heading) and 10 (disclaimer), exactly the
 * pre-1.2 explicit defaults.
 */

/** The canvas fields typography inherits from. */
export type CanvasTypography = Pick<
  CanvasConfig,
  'font_family' | 'font_size' | 'text_color' | 'background_color'
>;

export interface TypographyDefaults {
  /** Inherited size = canvas size × this (rounded). */
  sizeScale: number;
  /** Size used when neither the block nor the canvas has a valid one. */
  fallbackSize: number;
  fontWeight: FontWeight;
  /** Unitless line height used when the block leaves it unset. */
  lineHeight: number;
  /** 'text' = canvas text colour; 'muted' = a lighter tone of it. */
  inheritColor: 'text' | 'muted';
  fallbackColor: string;
  /** Size clamp (px). */
  minSize: number;
  maxSize: number;
}

export const TEXT_TYPOGRAPHY: TypographyDefaults = {
  sizeScale: 1,
  fallbackSize: 14,
  fontWeight: 400,
  lineHeight: 1.4,
  inheritColor: 'text',
  fallbackColor: '#111827',
  minSize: 6,
  maxSize: 96,
};

export const HEADING_TYPOGRAPHY: TypographyDefaults = {
  sizeScale: 18 / 14,
  fallbackSize: 18,
  fontWeight: 700,
  lineHeight: 1.2,
  inheritColor: 'text',
  fallbackColor: '#111827',
  minSize: 6,
  maxSize: 96,
};

export const DISCLAIMER_TYPOGRAPHY: TypographyDefaults = {
  sizeScale: 10 / 14,
  fallbackSize: 10,
  fontWeight: 400,
  lineHeight: 1.4,
  inheritColor: 'muted',
  fallbackColor: '#6b7280',
  minSize: 6,
  maxSize: 48,
};

export const BUTTON_TYPOGRAPHY: TypographyDefaults = {
  sizeScale: 1,
  fallbackSize: 14,
  fontWeight: 600,
  lineHeight: 16 / 14,
  inheritColor: 'text',
  fallbackColor: '#ffffff',
  minSize: 8,
  maxSize: 48,
};

/** Letter-spacing range offered in the UI (px). */
export const LETTER_SPACING_MIN = -1;
export const LETTER_SPACING_MAX = 6;

export interface ResolvedTypography {
  /** `fontStack()`-normalised family list (single-quoted names). */
  fontFamily: string;
  /** px */
  fontSize: number;
  fontWeight: string;
  color: string;
  /** Unitless multiplier (explicit or the block default). */
  lineHeight: number;
  /**
   * Line height in px when the block sets `line_height` (Outlook needs
   * px + `mso-line-height-rule:exactly`); `null` = emit the unitless
   * default.
   */
  lineHeightPx: number | null;
  /** px, `null` when 0 / unset. */
  letterSpacing: number | null;
  textTransform: 'uppercase' | 'capitalize' | null;
  fontStyle: 'italic' | null;
  textAlign: TextAlign;
}

/** Value an unset family / size / colour / weight / line height resolves to (for UI placeholders). */
export interface InheritedTypography {
  font_family: string;
  font_size: number;
  font_weight: FontWeight;
  color: string;
  line_height: number;
}

/** Canvas-derived values a block inherits when it leaves a field unset. */
export function inheritedTypography(
  canvas: Partial<CanvasTypography> | null | undefined,
  defaults: TypographyDefaults,
): InheritedTypography {
  const canvasSize = px(canvas?.font_size, defaults.minSize, defaults.maxSize, 14);
  const size =
    canvas && canvas.font_size !== undefined
      ? Math.round(canvasSize * defaults.sizeScale)
      : defaults.fallbackSize;
  const text = safeColor(canvas?.text_color, defaults.fallbackColor);
  const color =
    defaults.inheritColor === 'muted'
      ? mutedColor(text, safeColor(canvas?.background_color, '#ffffff'), defaults.fallbackColor)
      : text;
  return {
    font_family: fontStack(canvas?.font_family),
    font_size: clampSize(size, defaults),
    font_weight: defaults.fontWeight,
    color,
    line_height: defaults.lineHeight,
  };
}

/** Resolves a block style against the canvas (see module docs). */
export function resolveTypography(
  style: TextStyle | null | undefined,
  canvas: Partial<CanvasTypography> | null | undefined,
  defaults: TypographyDefaults,
): ResolvedTypography {
  const s = style ?? {};
  const inherited = inheritedTypography(canvas, defaults);

  const fontSize =
    s.font_size === undefined || s.font_size === null
      ? inherited.font_size
      : px(s.font_size, defaults.minSize, defaults.maxSize, inherited.font_size);

  const explicitLineHeight =
    typeof s.line_height === 'number' && Number.isFinite(s.line_height) && s.line_height > 0;
  const lineHeight = explicitLineHeight
    ? num(s.line_height, 0.5, 4, defaults.lineHeight)
    : defaults.lineHeight;

  const spacing = num(s.letter_spacing, -5, 20, 0);
  const transform = s.text_transform;

  return {
    fontFamily: s.font_family
      ? fontStack(s.font_family, inherited.font_family)
      : inherited.font_family,
    fontSize,
    fontWeight: validFontWeight(s.font_weight, defaults.fontWeight),
    color: s.color ? safeColor(s.color, inherited.color) : inherited.color,
    lineHeight,
    lineHeightPx: explicitLineHeight ? Math.round(fontSize * lineHeight) : null,
    letterSpacing: spacing === 0 ? null : spacing,
    textTransform: transform === 'uppercase' || transform === 'capitalize' ? transform : null,
    fontStyle: s.font_style === 'italic' ? 'italic' : null,
    textAlign: validTextAlign(s.text_align) as TextAlign,
  };
}

/**
 * Inline declarations for a resolved style, in an Outlook-friendly
 * order: `mso-line-height-rule:exactly` precedes the px `line-height`
 * so the shell's Outlook pass doesn't add a second rule.
 */
export function typographyDeclarations(
  t: ResolvedTypography,
  options: { color?: boolean; align?: boolean } = {},
): StyleDeclarations {
  const { color = true, align = true } = options;
  return {
    'font-family': t.fontFamily,
    'font-size': `${t.fontSize}px`,
    'font-weight': t.fontWeight,
    'font-style': t.fontStyle,
    color: color ? t.color : undefined,
    ...(t.lineHeightPx !== null
      ? { 'mso-line-height-rule': 'exactly', 'line-height': `${t.lineHeightPx}px` }
      : { 'line-height': t.lineHeight }),
    'letter-spacing': t.letterSpacing !== null ? `${t.letterSpacing}px` : undefined,
    'text-transform': t.textTransform,
    'text-align': align ? t.textAlign : undefined,
  };
}

/** React style object equivalent of {@link typographyDeclarations} (canvas renderers). */
export function typographyCss(
  t: ResolvedTypography,
  options: { color?: boolean; align?: boolean } = {},
): CSSProperties {
  const { color = true, align = true } = options;
  const css: CSSProperties = {
    fontFamily: t.fontFamily,
    fontSize: `${t.fontSize}px`,
    fontWeight: t.fontWeight as CSSProperties['fontWeight'],
    lineHeight: t.lineHeightPx !== null ? `${t.lineHeightPx}px` : t.lineHeight,
  };
  if (color) css.color = t.color;
  if (t.fontStyle) css.fontStyle = t.fontStyle;
  if (t.letterSpacing !== null) css.letterSpacing = `${t.letterSpacing}px`;
  if (t.textTransform) css.textTransform = t.textTransform;
  if (align) css.textAlign = t.textAlign;
  return css;
}

/**
 * Returns a copy of `style` with `key` set to `next`, or removed when
 * `next` is `undefined` (so "inherit" never lands in JSON as a key).
 * Tolerates the `[]` PHP sends back for an empty style object.
 */
export function withStyleField<K extends keyof TextStyle>(
  style: TextStyle | null | undefined,
  key: K,
  next: TextStyle[K] | undefined,
): TextStyle {
  const copy: TextStyle = Array.isArray(style) ? {} : { ...(style ?? {}) };
  if (next === undefined) {
    delete copy[key];
  } else {
    copy[key] = next;
  }
  return copy;
}

/**
 * A lighter tone of `text` towards `background` (35 %), used for the
 * inherited disclaimer colour. Non-hex inputs yield `fallback`.
 */
export function mutedColor(text: string, background: string, fallback: string): string {
  const a = hexChannels(text);
  const b = hexChannels(background);
  if (!a || !b) return fallback;
  const mix = a.map((c, i) => Math.round(c + (b[i]! - c) * 0.35));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function hexChannels(value: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function clampSize(size: number, defaults: TypographyDefaults): number {
  return Math.round(Math.min(defaults.maxSize, Math.max(defaults.minSize, size)));
}
