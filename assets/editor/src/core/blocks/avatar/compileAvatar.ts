import type { AvatarBlock } from '@/core/schema/blocks';
import { attr, bgcolorAttr, horizontalPadding, inlineStyle, paddingCss } from '@/core/compiler/css';
import { checkAlt, clampToAvailable, markerAttr } from '@/core/compiler/issues';
import type { CompileContext } from '../registry';
import { alignedBlockTable, alignMargin, imageStyle } from '../image/markup';
import { cssRadius, resolveAvatar } from './model';

/**
 * Avatar block → email HTML.
 *
 * The square `width` × `height` image is clamped to the space
 * available. Its shape comes from the PNG itself once the editor has
 * rendered it (mask + ring baked in, so Outlook shows it too); the CSS
 * `border-radius` is kept for modern clients and for avatars that were
 * never rendered (pasted URLs, URL-only storage, pre-1.2 rows).
 *
 * A ring that is not baked into the PNG is drawn email-safely as a
 * padded cell with the ring colour as background (and `bgcolor` for
 * Outlook, which then shows a square frame).
 */
export function compileAvatar(block: AvatarBlock, ctx: CompileContext): string {
  const avatar = resolveAvatar(block);
  checkAlt(ctx, block, avatar.alt);

  const available = ctx.availableWidth - horizontalPadding(block.padding);
  const size = clampToAvailable(ctx, block, avatar.size, available);

  const ringBaked = avatar.processed !== null && avatar.processed.ring_width > 0;
  const cssRing = !ringBaked && avatar.ringWidth > 0 ? Math.min(avatar.ringWidth, Math.floor(size / 4)) : 0;
  const imgSize = Math.max(1, size - cssRing * 2);

  const outerRadius = cssRadius(avatar.shape, size);
  const innerRadius = cssRadius(avatar.shape, imgSize);

  const style = imageStyle(
    {
      width: `${imgSize}px`,
      height: `${imgSize}px`,
      'border-radius': innerRadius,
      'object-fit': 'cover',
    },
    cssRing > 0 ? 'left' : avatar.align,
  );

  const marker = markerAttr(block);
  let inner = `<img${marker} src="${attr(avatar.src)}" alt="${attr(avatar.alt)}" width="${imgSize}" height="${imgSize}" style="${style}" />`;
  if (avatar.link) inner = `<a${marker} href="${attr(avatar.link)}">${inner}</a>`;

  if (cssRing > 0) {
    const tableStyle = inlineStyle({
      'border-collapse': 'separate',
      margin: alignMargin(avatar.align),
    });
    const cellStyle = inlineStyle({
      padding: `${cssRing}px`,
      'background-color': avatar.ringColor,
      'border-radius': outerRadius,
    });
    inner =
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${tableStyle}">` +
      `<tr><td${bgcolorAttr(avatar.ringColor)} style="${cellStyle}">${inner}</td></tr></table>`;
  }

  return alignedBlockTable(inner, { padding: paddingCss(block.padding), align: avatar.align });
}
