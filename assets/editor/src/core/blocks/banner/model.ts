import type { BannerBlock } from '@/core/schema/blocks';
import { intPx, px } from '@/core/compiler/css';
import { positivePx, resolveAlign, type ImageAlign } from '../image/model';

/**
 * Read-time normalisation for the Banner block. Pre-1.2 rows (no
 * `full_width` / `align`) resolve to a fixed-width, centred banner —
 * exactly what they compiled to before; `width: 0` keeps meaning "fill
 * the space".
 */
export interface ResolvedBanner {
  src: string;
  alt: string;
  link: string;
  /** Fixed width (ignored when `fullWidth`). */
  width: number;
  fullWidth: boolean;
  align: ImageAlign;
  radius: number;
  naturalWidth: number | null;
  naturalHeight: number | null;
  staticFallback: string;
}

export function resolveBanner(block: BannerBlock): ResolvedBanner {
  const width = intPx(block.width, 0, 4000, 0);
  return {
    src: typeof block.src === 'string' ? block.src : '',
    alt: typeof block.alt === 'string' ? block.alt : '',
    link: typeof block.link === 'string' ? block.link.trim() : '',
    width,
    fullWidth: block.full_width === true || width === 0,
    align: resolveAlign(block.align, 'center'),
    radius: px(block.border_radius, 0, 999),
    naturalWidth: positivePx(block.natural_width, 20000),
    naturalHeight: positivePx(block.natural_height, 20000),
    staticFallback:
      typeof block.static_fallback_url === 'string' ? block.static_fallback_url.trim() : '',
  };
}

/** Height for a banner shown `width` px wide (0 when its aspect is unknown). */
export function bannerHeight(banner: ResolvedBanner, width: number): number {
  if (!banner.naturalWidth || !banner.naturalHeight || width <= 0) return 0;
  return Math.max(1, Math.round((width * banner.naturalHeight) / banner.naturalWidth));
}
