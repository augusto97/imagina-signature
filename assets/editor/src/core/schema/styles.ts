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

export interface TypographyStyle {
  font_family: string;
  font_size: number;
  font_weight: FontWeight;
  color: string;
  line_height?: number;
  text_align?: TextAlign;
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
