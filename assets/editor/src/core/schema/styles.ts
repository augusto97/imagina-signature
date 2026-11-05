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

/** Line style of a border / rule. */
export type BorderLineStyle = 'solid' | 'dashed' | 'dotted';

/**
 * One border edge (or a uniform border): width in px, line style and
 * colour. Used by {@link BoxStyle} sides, the container column divider
 * and the Divider block.
 */
export interface BorderSide {
  width: number;
  style: BorderLineStyle;
  color: string;
}

/**
 * Historic name of {@link BorderSide} (the Divider block's `border`).
 * Kept as an alias so existing imports keep compiling.
 */
export type BorderStyle = BorderSide;

/** Horizontal alignment of a box (and of the content inside it). */
export type BoxAlign = 'left' | 'center' | 'right';

/** Vertical alignment of a container column's content. */
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * Generic "box" styling (schema 1.1). Any block may carry one in
 * `block.box`; container columns carry one in `column.box`. Every field
 * is optional — an absent / empty box renders nothing extra.
 *
 *  - `border` is the uniform border; `border_top` … `border_left`
 *    override it per side (a side with `width: 0` removes that edge).
 *  - `padding` is the box's INNER padding, independent from a block's
 *    own `padding` field (which stays inside the block's markup).
 *  - `align` aligns the content inside the box and, when `width` is
 *    set, the box itself within the available width.
 *  - `width` is an optional fixed pixel width (clamped to the space
 *    available at compile time). Ignored for container columns, whose
 *    width is a percentage of the row.
 *
 * Outlook desktop ignores `border_radius` (square corners there).
 */
export interface BoxStyle {
  background_color?: string;
  border?: BorderSide;
  border_top?: BorderSide;
  border_right?: BorderSide;
  border_bottom?: BorderSide;
  border_left?: BorderSide;
  border_radius?: number;
  padding?: Padding;
  align?: BoxAlign;
  /** Optional fixed px width of the box. */
  width?: number;
}

/** Keys of {@link BoxStyle} holding a single border side. */
export type BoxBorderSideKey = 'border_top' | 'border_right' | 'border_bottom' | 'border_left';
