import type { ContactRowBlock } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { getAssetsBaseUrl, iconUrl } from '@/core/compiler/assets';
import {
  attr,
  escapeHtml,
  fontStack,
  fontWeight,
  inlineStyle,
  num,
  paddingCss,
  px,
  safeColor,
  type StyleDeclarations,
} from '@/core/compiler/css';
import { blockLabel, checkContrast, markerAttr, report } from '@/core/compiler/issues';
import type { CompileContext } from '../registry';
import {
  CONTACT_ICON,
  contactHref,
  displayValue,
  itemPrefix,
  normalizeContactRow,
  resolveItemValue,
  typeLabel,
  type ContactItem,
} from './normalize';

/** Gap between an icon and its text, in px. */
export const CONTACT_ICON_GAP = 8;

type Align = 'left' | 'center' | 'right';

interface Prepared {
  item: ContactItem;
  href: string;
  prefix: string;
}

/** Everything the layout helpers need, resolved once per compile. */
interface Parts {
  items: Prepared[];
  align: Align;
  separator: string;
  showIcons: boolean;
  rowGap: number;
  /** Inline style of a text cell, plus extra declarations. */
  textStyle: (extra?: StyleDeclarations) => string;
  /** Prefix + (linked) value. */
  valueHtml: (p: Prepared) => string;
  /** Fixed-width icon cell. */
  iconCell: (item: ContactItem, padTop: number) => string;
}

/**
 * Contact → email HTML.
 *
 * - `stacked`: one table row per item — a fixed-width icon cell and a
 *   text cell, both `valign="middle"`.
 * - `inline`: a single line. With icons it is a single-row table
 *   (icon / text / separator cells, which Outlook aligns reliably);
 *   without icons it is one text cell whose items only wrap at the
 *   separators.
 *
 * A full-width wrapper cell carries the block padding and alignment.
 * Links are derived from each value (see `contactHref`) with the
 * signature's variables resolved; every value goes through css.ts.
 */
export function compileContactRow(block: ContactRowBlock, ctx: CompileContext): string {
  const c = normalizeContactRow(block);
  const color = safeColor(c.style.color, '#374151');
  const linkColor = c.link_color === undefined ? color : safeColor(c.link_color, color);
  const fontSize = px(c.style.font_size, 6, 48, 13);
  const align: Align =
    c.style.text_align === 'center' || c.style.text_align === 'right' ? c.style.text_align : 'left';
  checkContrast(ctx, block, color, safeColor(ctx.canvas.background_color, '#ffffff'), fontSize);

  // Items whose value resolves to nothing (an employee without a mobile
  // number, a brand-kit field left blank) are left out, icon included.
  const items: Prepared[] = c.items
    .filter((item) => resolveItemValue(item.value, ctx.variables).trim() !== '')
    .map((item) => ({
      item,
      href: contactHref(item, ctx.variables),
      prefix: itemPrefix(item, c.label_mode),
    }));
  if (items.length === 0) return '';

  let showIcons = c.show_icons;
  if (showIcons && getAssetsBaseUrl() === '') {
    report(
      ctx,
      'warning',
      __(
        '%s block: the plugin address is unknown, so the icons were left out.',
        blockLabel(block.type),
      ),
      block,
      'icons-base-missing',
    );
    showIcons = false;
  }

  const marker = markerAttr(block);
  const linkStyle = inlineStyle({ color: linkColor, 'text-decoration': 'none' });
  const iconStyle = inlineStyle({
    display: 'block',
    border: 0,
    outline: 'none',
    'text-decoration': 'none',
    width: `${c.icon_size}px`,
    height: `${c.icon_size}px`,
  });
  const iconWidth = c.icon_size + CONTACT_ICON_GAP;

  const parts: Parts = {
    items,
    align,
    separator: c.separator,
    showIcons,
    rowGap: c.row_gap,
    textStyle: (extra = {}) =>
      inlineStyle({
        'font-family': fontStack(c.style.font_family ?? ctx.canvas.font_family),
        'font-size': `${fontSize}px`,
        'font-weight': fontWeight(c.style.font_weight, 400),
        color,
        'line-height': num(c.style.line_height ?? 1.4, 0.8, 3, 1.4),
        ...extra,
      }),
    valueHtml: ({ item, href, prefix }) => {
      const value = escapeHtml(displayValue(item, ctx.variables));
      const linked = href
        ? `<a${marker} href="${attr(href)}" style="${linkStyle}">${value}</a>`
        : value;
      if (prefix === '') return linked;
      return `<span style="font-weight:bold">${escapeHtml(prefix)}</span>&nbsp;${linked}`;
    },
    iconCell: (item, padTop) => {
      const src = iconUrl(CONTACT_ICON[item.type], c.icon_shape, c.icon_tone);
      const style = inlineStyle({
        width: `${iconWidth}px`,
        'padding-top': padTop > 0 ? `${padTop}px` : undefined,
        'line-height': 0,
        'font-size': 0,
      });
      return (
        `<td width="${iconWidth}" valign="middle" style="${style}">` +
        // The icon names the row ("Email", "Phone"…) when images are
        // blocked and for screen readers; an empty alt would leave a
        // blank gap and is flagged by the validator.
        `<img${marker} src="${attr(src)}" width="${c.icon_size}" height="${c.icon_size}" alt="${attr(typeLabel(item.type))}" style="${iconStyle}">` +
        `</td>`
      );
    },
  };

  const inner =
    c.layout === 'inline' ? (showIcons ? inlineTable(parts) : inlineText(parts)) : stacked(parts);

  const wrapperStyle = inlineStyle({ padding: paddingCss(block.padding), 'text-align': align });
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">` +
    `<tr><td align="${align}" style="${wrapperStyle}">${inner}</td></tr></table>`
  );
}

function table(align: Align, rows: string): string {
  const alignAttr = align === 'left' ? '' : ` align="${align}"`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${alignAttr} style="border-collapse:collapse">${rows}</table>`;
}

function stacked(p: Parts): string {
  const rows = p.items.map((item, i) => {
    const padTop = i > 0 ? p.rowGap : 0;
    const textStyle = p.textStyle({ 'padding-top': padTop > 0 ? `${padTop}px` : undefined });
    const icon = p.showIcons ? p.iconCell(item.item, padTop) : '';
    return `<tr>${icon}<td valign="middle" style="${textStyle}">${p.valueHtml(item)}</td></tr>`;
  });
  return table(p.align, rows.join(''));
}

/**
 * Inline separator as HTML: inner / leading spaces become
 * non-breaking (a line never starts with the separator), a trailing
 * space stays a normal space — the only wrap opportunity.
 */
export function separatorHtml(separator: string): string {
  const trailing = /\s$/.test(separator);
  const core = escapeHtml(separator.replace(/\s+$/, '')).replace(/ /g, '&nbsp;');
  return trailing ? `${core} ` : core;
}

function inlineText(p: Parts): string {
  const items = p.items.map(
    (item) => `<span style="white-space:nowrap">${p.valueHtml(item)}</span>`,
  );
  return table(
    p.align,
    `<tr><td style="${p.textStyle()}">${items.join(separatorHtml(p.separator))}</td></tr>`,
  );
}

function inlineTable(p: Parts): string {
  const sep = p.separator.trim();
  const cells: string[] = [];
  p.items.forEach((item, i) => {
    if (i > 0) {
      cells.push(
        sep === ''
          ? `<td width="12" style="width:12px;font-size:0;line-height:0">&nbsp;</td>`
          : `<td valign="middle" style="${p.textStyle({ padding: '0 8px' })}">${escapeHtml(sep)}</td>`,
      );
    }
    cells.push(p.iconCell(item.item, 0));
    cells.push(
      `<td valign="middle" style="${p.textStyle({ 'white-space': 'nowrap' })}">${p.valueHtml(item)}</td>`,
    );
  });
  return table(p.align, `<tr>${cells.join('')}</tr>`);
}
