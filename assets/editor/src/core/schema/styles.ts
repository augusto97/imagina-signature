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

export interface BorderStyle {
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}
