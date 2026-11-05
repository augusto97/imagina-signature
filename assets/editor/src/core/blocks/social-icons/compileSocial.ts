import type { SocialIconsBlock } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { getAssetsBaseUrl, iconUrl } from '@/core/compiler/assets';
import { attr, horizontalPadding, inlineStyle, paddingCss } from '@/core/compiler/css';
import { blockLabel, markerAttr, report } from '@/core/compiler/issues';
import { replaceVariables } from '@/core/compiler/variables';
import type { CompileContext } from '../registry';
import { iconTitle } from './iconSet';
import { normalizeSocialIcons, socialHref } from './normalize';

/**
 * Social icons → email HTML.
 *
 * A full-width wrapper cell carries the block padding and alignment;
 * inside it, a single-row table holds one cell per icon:
 * `<a href><img width height alt></a>`. Icons are hosted PNGs
 * (`core/compiler/assets.ts`), spacing is cell padding, alignment is
 * the inner table's `align` (contained by the wrapper cell so it never
 * floats next to the following block). Items without a URL — including
 * a `{{variable}}` that resolves to nothing — are left out with a
 * warning.
 */
export function compileSocialIcons(block: SocialIconsBlock, ctx: CompileContext): string {
  const s = normalizeSocialIcons(block);
  const label = blockLabel(block.type);

  if (getAssetsBaseUrl() === '') {
    report(
      ctx,
      'error',
      __('%s block: the plugin address is unknown, so the icon images cannot be linked.', label),
      block,
      'icons-base-missing',
    );
    return '';
  }

  const links: Array<{ href: string; network: string }> = [];
  for (const item of s.items) {
    // Resolved first, so an icon whose `{{company_x}}` is blank in the
    // brand kit is left out (with a warning) instead of linking to `#`,
    // and a scheme-less variable value still gets its https://.
    const href = socialHref(item.network, replaceVariables(item.url, ctx.variables).text);
    if (href === '') {
      report(
        ctx,
        'warning',
        __(
          '%s block: the %s icon has no link yet, so it was left out.',
          label,
          iconTitle(item.network),
        ),
        block,
        'social-missing-url',
      );
      continue;
    }
    links.push({ href, network: item.network });
  }
  if (links.length === 0) return '';

  const rowWidth = links.length * s.size + (links.length - 1) * s.spacing;
  const available = ctx.availableWidth - horizontalPadding(block.padding);
  if (rowWidth > available) {
    report(
      ctx,
      'warning',
      __(
        '%s block is %spx wide but only %spx are available here; use fewer or smaller icons.',
        label,
        String(rowWidth),
        String(Math.max(0, Math.floor(available))),
      ),
      block,
      'social-too-wide',
    );
  }

  const marker = markerAttr(block);
  const imgStyle = inlineStyle({
    display: 'block',
    border: 0,
    outline: 'none',
    'text-decoration': 'none',
    width: `${s.size}px`,
    height: `${s.size}px`,
  });
  const cells = links.map(({ href, network }, i) => {
    const cellStyle = inlineStyle({
      padding: i < links.length - 1 ? `0 ${s.spacing}px 0 0` : '0',
      'line-height': 0,
      'font-size': 0,
    });
    const src = iconUrl(network, s.shape, s.tone);
    return (
      `<td valign="middle" style="${cellStyle}">` +
      `<a${marker} href="${attr(href)}" style="text-decoration:none">` +
      `<img${marker} src="${attr(src)}" width="${s.size}" height="${s.size}" alt="${attr(iconTitle(network))}" style="${imgStyle}">` +
      `</a></td>`
    );
  });

  const align = s.align;
  const wrapperStyle = inlineStyle({ padding: paddingCss(block.padding), 'text-align': align });
  const innerAlign = align === 'left' ? '' : ` align="${align}"`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">` +
    `<tr><td align="${align}" style="${wrapperStyle}">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${innerAlign} style="border-collapse:collapse">` +
    `<tr>${cells.join('')}</tr></table>` +
    `</td></tr></table>`
  );
}
