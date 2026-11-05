import type { ImageBlock } from '@/core/schema/blocks';
import type { BorderStyle } from '@/core/schema/styles';
import { borderStyle, intPx, px, safeColor } from '@/core/compiler/css';
import { targetPixelWidth } from '@/services/uploads';

/**
 * Read-time normalisation for the Image block (and helpers shared with
 * Avatar / Banner).
 *
 * Every 1.2 field is optional, so rows saved by older versions,
 * templates and hand-edited JSON load unchanged: the defaults below
 * reproduce the pre-1.2 output (left aligned, no border, explicit
 * height scaled with the width). Renderer, properties panel and
 * compile all read the block through {@link resolveImage}, so nothing
 * has to be migrated in the stored schema.
 */

export type ImageAlign = 'left' | 'center' | 'right';

export interface ResolvedBorder {
  width: number;
  style: BorderStyle['style'];
  color: string;
}

export interface ResolvedImage {
  src: string;
  alt: string;
  link: string;
  /** Requested display width (null = not set). */
  width: number | null;
  /** Explicit height (null = not set). */
  height: number | null;
  lockAspect: boolean;
  naturalWidth: number | null;
  naturalHeight: number | null;
  align: ImageAlign;
  radius: number;
  /** Null when there is no visible border. */
  border: ResolvedBorder | null;
  staticFallback: string;
}

/** Validated alignment keyword. */
export function resolveAlign(value: unknown, fallback: ImageAlign): ImageAlign {
  return value === 'left' || value === 'center' || value === 'right' ? value : fallback;
}

/** Positive integer px or null. */
export function positivePx(value: unknown, max = 4000): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return intPx(n, 1, max, 1);
}

/** Border with a visible width, clamped and validated; null otherwise. */
export function resolveBorder(border: BorderStyle | undefined | null): ResolvedBorder | null {
  if (!border || typeof border !== 'object') return null;
  const width = intPx(border.width, 0, 20, 0);
  if (width <= 0) return null;
  return {
    width,
    style: borderStyle(border.style) as BorderStyle['style'],
    color: safeColor(border.color, '#e5e7eb'),
  };
}

export function resolveImage(block: ImageBlock): ResolvedImage {
  return {
    src: typeof block.src === 'string' ? block.src : '',
    alt: typeof block.alt === 'string' ? block.alt : '',
    link: typeof block.link === 'string' ? block.link.trim() : '',
    width: positivePx(block.width),
    height: positivePx(block.height),
    lockAspect: block.lock_aspect !== false,
    naturalWidth: positivePx(block.natural_width, 20000),
    naturalHeight: positivePx(block.natural_height, 20000),
    align: resolveAlign(block.align, 'left'),
    radius: px(block.border_radius, 0, 999),
    border: resolveBorder(block.border),
    staticFallback:
      typeof block.static_fallback_url === 'string' ? block.static_fallback_url.trim() : '',
  };
}

/**
 * Height to emit for an image displayed `width` px wide.
 *
 *  - aspect locked and intrinsic size known → from the image's own ratio;
 *  - explicit `height` → scaled by `width / requested` (so a clamped
 *    image keeps the proportions the user set — Outlook honours the
 *    height attribute verbatim);
 *  - otherwise 0 (no height attribute; clients derive it).
 */
export function scaledHeight(
  image: Pick<ResolvedImage, 'lockAspect' | 'naturalWidth' | 'naturalHeight' | 'height'>,
  width: number,
  requested: number,
): number {
  if (width <= 0) return 0;
  if (image.lockAspect && image.naturalWidth && image.naturalHeight) {
    return Math.max(1, Math.round((width * image.naturalHeight) / image.naturalWidth));
  }
  if (image.height) {
    return Math.max(1, Math.round((image.height * width) / Math.max(1, requested || width)));
  }
  return 0;
}

/** Height / width ratio from intrinsic size, else from explicit width + height. */
export function aspectRatio(
  natural: { width: number; height: number } | null,
  width: number | null | undefined,
  height: number | null | undefined,
): number | null {
  if (natural && natural.width > 0 && natural.height > 0) return natural.height / natural.width;
  if (width && height) return height / width;
  return null;
}

/**
 * Returns true when `src` looks like an animated-GIF URL — used to
 * show / hide the Static fallback URL input. Best-effort by file
 * extension only (arbitrary remote URLs can't be sniffed from the
 * editor without a CORS round-trip).
 */
export function isAnimatedGif(src: string): boolean {
  if (!src) return false;
  const noQuery = src.split('?')[0]?.toLowerCase() ?? '';
  return noQuery.endsWith('.gif');
}

/**
 * Pixel width an image needs to look sharp at `displayWidth` CSS px on
 * 2× screens — the same target the upload optimiser renders to (2×,
 * capped at 1200 px).
 */
export function retinaPixelWidth(displayWidth: number): number {
  return targetPixelWidth(displayWidth);
}

/** True when an image `natural` px wide may look soft at `displayWidth`. */
export function isLowResolution(
  natural: { width: number; height: number } | null,
  displayWidth: number,
): boolean {
  if (!natural || !(displayWidth > 0)) return false;
  return natural.width < retinaPixelWidth(displayWidth);
}
