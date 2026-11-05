/**
 * Style primitives shared across blocks (CLAUDE.md §8.1).
 */

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type TextAlign = 'left' | 'center' | 'right';
export type FontWeight = 400 | 500 | 600 | 700;
export type TextTransform = 'none' | 'uppercase' | 'capitalize';
export type FontStyle = 'normal' | 'italic';

/**
 * Typography of a text-like block (text, heading, disclaimer, button
 * label).
 *
 * `font_family`, `font_size` and `color` are optional: `undefined`
 * means "inherit from the canvas" (`canvas.font_family`,
 * `canvas.font_size` — scaled per block type — and
 * `canvas.text_color`), so the canvas "Default font" / "Default size"
 * / "Text color" controls restyle every block that hasn't overridden
 * them. Rows saved before 1.2 carry explicit values and keep them.
 *
 * `font_weight` falls back to the block's own default (400 text, 700
 * heading, 600 button) when absent.
 */
export interface TextStyle {
  font_family?: string;
  font_size?: number;
  font_weight?: FontWeight;
  color?: string;
  /** Unitless multiplier; emitted as px (+ mso-line-height-rule) in the export. */
  line_height?: number;
  text_align?: TextAlign;
  /** Tracking in px (−1…6 in the UI). */
  letter_spacing?: number;
  text_transform?: TextTransform;
  font_style?: FontStyle;
}

/**
 * Fully specified typography (family, size, weight and colour always
 * set). Used by blocks that don't inherit from the canvas, e.g. the
 * contact row.
 */
export interface TypographyStyle extends TextStyle {
  font_family: string;
  font_size: number;
  font_weight: FontWeight;
  color: string;
}

export interface BorderStyle {
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}
