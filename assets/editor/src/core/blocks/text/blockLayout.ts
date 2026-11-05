import type { CSSProperties } from 'react';
import type { TextAlign } from '@/core/schema/styles';
import { textAlign } from '@/core/compiler/css';

/**
 * Horizontal positioning shared by the shrink-to-fit blocks (button,
 * divider, QR code, vCard).
 *
 * Email-safe pattern: a full-width row whose cell carries
 * `align="…"` + `text-align`, holding the block's own table, which also
 * gets the legacy `align` attribute (honoured by Outlook) plus auto
 * margins (honoured by everything else). Inside its own cell an
 * `align="right"` table can't float past the block.
 */

/** Normalised alignment (`left` for anything unknown / unset). */
export function blockAlign(value: unknown): TextAlign {
  const v = textAlign(value);
  return v === 'center' || v === 'right' ? v : 'left';
}

/** ` align="…"` (with leading space) for a nested table, '' for left. */
export function tableAlignAttr(align: TextAlign): string {
  return align === 'left' ? '' : ` align="${align}"`;
}

/**
 * `margin` value that positions a nested table / block image
 * (`undefined` for left — `inlineStyle()` then skips it).
 */
export function alignMargin(align: TextAlign): string | undefined {
  if (align === 'center') return '0 auto';
  if (align === 'right') return '0 0 0 auto';
  return undefined;
}

/**
 * Full-width wrapper row: `padding` (a CSS shorthand from
 * `paddingCss()`) on the cell, which aligns `inner`.
 */
export function alignedRow(inner: string, align: TextAlign, padding: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td align="${align}" style="padding:${padding};text-align:${align}">${inner}</td></tr></table>`;
}

/** Canvas (React) counterpart of {@link alignMargin}. */
export function alignMarginCss(align: TextAlign): CSSProperties {
  if (align === 'center') return { marginLeft: 'auto', marginRight: 'auto' };
  if (align === 'right') return { marginLeft: 'auto', marginRight: 0 };
  return {};
}
