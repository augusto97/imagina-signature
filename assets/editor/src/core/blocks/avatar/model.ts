import type { AvatarBlock } from '@/core/schema/blocks';
import { intPx, safeColor } from '@/core/compiler/css';
import { ROUNDED_RADIUS_RATIO } from '@/services/imageOptimize';
import { resolveAlign, type ImageAlign } from '../image/model';

/**
 * Read-time normalisation for the Avatar block.
 *
 * Pre-1.2 avatars carry only `src` / `alt` / `size`: they resolve to a
 * circle without ring, left aligned, whose `src` is used as-is (CSS
 * `border-radius:50%` — unchanged output). Once the user uploads,
 * picks, crops or restyles the avatar, the editor renders a PNG with
 * the shape mask and ring baked in (`processed` records with what),
 * so Outlook — which ignores `border-radius` — shows it right too.
 */

export type AvatarShape = NonNullable<AvatarBlock['shape']>;
export type AvatarRenderSpec = NonNullable<AvatarBlock['processed']>;

export const AVATAR_MIN_SIZE = 24;
export const AVATAR_MAX_SIZE = 200;
export const AVATAR_MAX_RING = 12;
export const DEFAULT_RING_COLOR = '#ffffff';
/**
 * CSS width an avatar's SOURCE upload is optimised for (→ up to 600 px),
 * leaving room to grow the avatar or re-crop without re-uploading.
 */
export const AVATAR_SOURCE_DISPLAY = 300;

export interface ResolvedAvatar {
  src: string;
  alt: string;
  link: string;
  size: number;
  shape: AvatarShape;
  ringWidth: number;
  ringColor: string;
  align: ImageAlign;
  /** The unmasked photo, '' when the avatar was never processed. */
  sourceUrl: string;
  /** What `src` bakes in, or null when `src` is the user's image as-is. */
  processed: AvatarRenderSpec | null;
}

export function resolveShape(value: unknown): AvatarShape {
  return value === 'rounded' || value === 'square' ? value : 'circle';
}

export function resolveAvatar(block: AvatarBlock): ResolvedAvatar {
  return {
    src: typeof block.src === 'string' ? block.src : '',
    alt: typeof block.alt === 'string' ? block.alt : '',
    link: typeof block.link === 'string' ? block.link.trim() : '',
    size: intPx(block.size, 8, 800, 64),
    shape: resolveShape(block.shape),
    ringWidth: intPx(block.ring_width, 0, AVATAR_MAX_RING, 0),
    ringColor: safeColor(block.ring_color, DEFAULT_RING_COLOR),
    align: resolveAlign(block.align, 'left'),
    sourceUrl: typeof block.source_url === 'string' ? block.source_url.trim() : '',
    processed: resolveProcessed(block.processed),
  };
}

function resolveProcessed(value: AvatarBlock['processed']): AvatarRenderSpec | null {
  if (!value || typeof value !== 'object' || typeof value.source_url !== 'string') return null;
  return {
    source_url: value.source_url,
    shape: resolveShape(value.shape),
    ring_width: intPx(value.ring_width, 0, AVATAR_MAX_RING, 0),
    ring_color: safeColor(value.ring_color, DEFAULT_RING_COLOR),
    size: intPx(value.size, 8, 800, 64),
  };
}

/** What `src` should be rendered with now, or null when there is no source to render. */
export function desiredSpec(avatar: ResolvedAvatar): AvatarRenderSpec | null {
  if (!avatar.sourceUrl) return null;
  return {
    source_url: avatar.sourceUrl,
    shape: avatar.shape,
    ring_width: avatar.ringWidth,
    ring_color: avatar.ringColor,
    size: avatar.size,
  };
}

/** Equality of two render specs (ring colour only matters with a ring). */
export function sameSpec(a: AvatarRenderSpec | null, b: AvatarRenderSpec | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.source_url === b.source_url &&
    a.shape === b.shape &&
    a.size === b.size &&
    a.ring_width === b.ring_width &&
    (a.ring_width === 0 || a.ring_color.toLowerCase() === b.ring_color.toLowerCase())
  );
}

/** True when `src` must be (re)rendered to match the avatar's settings. */
export function needsProcessing(avatar: ResolvedAvatar): boolean {
  const desired = desiredSpec(avatar);
  return desired !== null && !sameSpec(avatar.processed, desired);
}

/** Outer corner radius for CSS: `50%`, `Npx` or undefined (square). */
export function cssRadius(shape: AvatarShape, size: number): string | undefined {
  if (shape === 'circle') return '50%';
  if (shape === 'rounded') return `${Math.round(size * ROUNDED_RADIUS_RATIO)}px`;
  return undefined;
}
