import type { BannerBlock } from '@/core/schema/blocks';
import { horizontalPadding, paddingCss } from '@/core/compiler/css';
import { checkAlt, clampToAvailable, markerAttr } from '@/core/compiler/issues';
import type { CompileContext } from '../registry';
import { alignedBlockTable, dimensionAttrs, imageStyle, withOutlookFallback } from '../image/markup';
import { bannerHeight, resolveBanner } from './model';

/**
 * Banner block → email HTML. Full width fills exactly the pixels
 * available where the banner sits; a fixed width is clamped to them
 * (with a warning). Height follows the image's aspect when known.
 */
export function compileBanner(block: BannerBlock, ctx: CompileContext): string {
  const banner = resolveBanner(block);
  checkAlt(ctx, block, banner.alt);

  const available = Math.max(1, Math.floor(ctx.availableWidth - horizontalPadding(block.padding)));
  const width = banner.fullWidth ? available : clampToAvailable(ctx, block, banner.width, available);
  const height = bannerHeight(banner, width);
  const style = imageStyle(
    { 'border-radius': banner.radius ? `${banner.radius}px` : undefined },
    banner.align,
  );

  const inner = withOutlookFallback(
    banner.src,
    banner.staticFallback || undefined,
    banner.alt,
    dimensionAttrs(width, height),
    style,
    banner.link || undefined,
    markerAttr(block),
  );

  return alignedBlockTable(inner, { padding: paddingCss(block.padding), align: banner.align });
}
