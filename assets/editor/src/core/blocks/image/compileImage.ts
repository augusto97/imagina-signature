import type { ImageBlock } from '@/core/schema/blocks';
import { horizontalPadding, paddingCss } from '@/core/compiler/css';
import { checkAlt, clampToAvailable, markerAttr } from '@/core/compiler/issues';
import type { CompileContext } from '../registry';
import { resolveImage, scaledHeight } from './model';
import { alignedBlockTable, dimensionAttrs, imageStyle, withOutlookFallback } from './markup';

/**
 * Image block → email HTML.
 *
 *  - `width` / `height` attributes (Outlook ignores CSS sizes); the
 *    height follows the image's aspect when locked and known;
 *  - clamped to the pixels available where the block sits (minus its
 *    padding and border), with a warning when it had to shrink;
 *  - aligned by the wrapping cell (`align` + `text-align`) plus a
 *    margin on the block-level `<img>`;
 *  - optional link, border and radius; Outlook static-GIF fallback.
 */
export function compileImage(block: ImageBlock, ctx: CompileContext): string {
  const image = resolveImage(block);
  checkAlt(ctx, block, image.alt);

  const borderWidth = image.border?.width ?? 0;
  const available = ctx.availableWidth - horizontalPadding(block.padding) - borderWidth * 2;

  let requested = 0;
  let width = 0;
  if (image.width) {
    requested = image.width;
    width = clampToAvailable(ctx, block, requested, available);
  } else if (image.naturalWidth) {
    // No width chosen: intrinsic size, silently capped to the space.
    requested = image.naturalWidth;
    width = Math.max(1, Math.min(image.naturalWidth, Math.floor(available)));
  }
  const height = scaledHeight(image, width, requested);

  const style = imageStyle(
    {
      border: image.border
        ? `${image.border.width}px ${image.border.style} ${image.border.color}`
        : 0,
      'border-radius': image.radius ? `${image.radius}px` : undefined,
    },
    image.align,
  );

  const inner = withOutlookFallback(
    image.src,
    image.staticFallback || undefined,
    image.alt,
    dimensionAttrs(width, height),
    style,
    image.link || undefined,
    markerAttr(block),
  );

  return alignedBlockTable(inner, { padding: paddingCss(block.padding), align: image.align });
}
