import type { Block } from '@/core/schema/blocks';
import type { BoxStyle, Padding } from '@/core/schema/styles';
import type { CompiledImage } from '@/core/compiler/images';
import { parseCssColor, relativeLuminance } from '@/core/compiler/color';
import { findBlockByIdDeep } from '@/stores/schemaStore';

/**
 * Dark-mode safety for logos and icons.
 *
 * A dark logo on a TRANSPARENT background is invisible once a client
 * paints the message dark (Gmail iOS, Outlook apps, Outlook.com, Apple
 * Mail): the transparent pixels show the dark background, the logo's
 * dark pixels melt into it. Each image is loaded once in the browser,
 * downscaled onto a canvas and its pixels classified.
 */

/** Anything with the shape of `ImageData` (tests pass plain objects). */
export interface PixelData {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export interface DarkImageAnalysis {
  /** Share of fully / almost fully transparent pixels (alpha < 10 %). */
  transparentRatio: number;
  /** Share of clearly visible pixels (alpha ≥ 50 %). */
  visibleRatio: number;
  /** Share of the VISIBLE pixels that are dark (relative luminance < 0.2). */
  darkRatio: number;
  /** Mostly dark pixels on a transparent background. */
  risky: boolean;
}

export const DARK_IMAGE_RULES = {
  transparentAlpha: 26,
  visibleAlpha: 128,
  darkLuminance: 0.2,
  /** At least this share of the image must be transparent… */
  minTransparent: 0.1,
  /** …and at least this share of what is visible must be dark. */
  minDark: 0.6,
  /** Ignore (almost) empty images. */
  minVisible: 0.01,
} as const;

/** sRGB channel (0–255) → linear light, precomputed. */
const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const s = i / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});

export function analyzeDarkOnTransparent(image: PixelData): DarkImageAnalysis {
  const { data } = image;
  const total = Math.max(1, Math.floor(data.length / 4));
  let transparent = 0;
  let visible = 0;
  let dark = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < DARK_IMAGE_RULES.transparentAlpha) {
      transparent++;
      continue;
    }
    if (a < DARK_IMAGE_RULES.visibleAlpha) continue; // anti-aliased edge
    visible++;
    const lum =
      0.2126 * LINEAR[data[i]! | 0]! +
      0.7152 * LINEAR[data[i + 1]! | 0]! +
      0.0722 * LINEAR[data[i + 2]! | 0]!;
    if (lum < DARK_IMAGE_RULES.darkLuminance) dark++;
  }
  const transparentRatio = transparent / total;
  const visibleRatio = visible / total;
  const darkRatio = visible > 0 ? dark / visible : 0;
  return {
    transparentRatio,
    visibleRatio,
    darkRatio,
    risky:
      transparentRatio >= DARK_IMAGE_RULES.minTransparent &&
      visibleRatio >= DARK_IMAGE_RULES.minVisible &&
      darkRatio >= DARK_IMAGE_RULES.minDark,
  };
}

// ---------------------------------------------------------------------------
// Loading (browser only)
// ---------------------------------------------------------------------------

const MAX_SAMPLE = 96;
const LOAD_TIMEOUT_MS = 10_000;
const cache = new Map<string, Promise<DarkImageAnalysis | null>>();

/**
 * Loads `src` once per page (cached) and analyses it. Resolves `null`
 * — silently — when the image cannot be read: load error, timeout, no
 * 2D canvas, or a canvas tainted by a cross-origin image served without
 * CORS headers.
 */
export function analyzeImageUrl(src: string): Promise<DarkImageAnalysis | null> {
  let pending = cache.get(src);
  if (!pending) {
    pending = loadAndAnalyze(src);
    cache.set(src, pending);
  }
  return pending;
}

/** Test hook. */
export function clearDarkImageCache(): void {
  cache.clear();
}

function loadAndAnalyze(src: string): Promise<DarkImageAnalysis | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    // Ask for CORS so the canvas stays readable when the host allows it.
    // Same-origin images (Media Library) never need it.
    if (!isSameOrigin(src)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = window.setTimeout(() => resolve(null), LOAD_TIMEOUT_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(readPixels(img));
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function readPixels(img: HTMLImageElement): DarkImageAnalysis | null {
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, MAX_SAMPLE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Throws a SecurityError when the canvas is tainted.
    return analyzeDarkOnTransparent(ctx.getImageData(0, 0, canvas.width, canvas.height));
  } catch {
    return null;
  }
}

function isSameOrigin(src: string): boolean {
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Candidates & fix
// ---------------------------------------------------------------------------

export interface DarkImageCandidate {
  blockId: string;
  blockType: string;
  src: string;
  alt: string;
}

/** True for a colour light enough to keep a dark logo visible. */
export function isLightColor(value: string | null | undefined): boolean {
  const c = parseCssColor(value ?? '');
  return !!c && c.a >= 0.9 && relativeLuminance(c) >= 0.6;
}

/**
 * Images worth analysing: attributed to a block, one per block + src,
 * and not already sitting on the block's own light box background
 * (which is what the one-click fix adds).
 */
export function darkImageCandidates(
  images: CompiledImage[],
  blocks: Block[],
): DarkImageCandidate[] {
  const out: DarkImageCandidate[] = [];
  const seen = new Set<string>();
  for (const image of images) {
    if (!image.blockId || !image.blockType) continue;
    const key = `${image.blockId}|${image.src}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const block = findBlockByIdDeep(blocks, image.blockId);
    if (!block || isLightColor(block.box?.background_color)) continue;
    out.push({
      blockId: image.blockId,
      blockType: image.blockType,
      src: image.src,
      alt: image.alt,
    });
  }
  return out;
}

const DEFAULT_FIX_PADDING: Padding = { top: 4, right: 4, bottom: 4, left: 4 };

/**
 * The block's box with a light background: `#ffffff`, 4 px padding and
 * 4 px radius — keeping every other box setting (borders, width,
 * alignment) and any padding / radius the user already chose.
 */
export function lightBoxFor(box: BoxStyle | undefined): BoxStyle {
  const p = box?.padding;
  const hasPadding = !!p && [p.top, p.right, p.bottom, p.left].some((v) => Number(v) > 0);
  return {
    ...(box ?? {}),
    background_color: '#ffffff',
    padding: hasPadding ? p : { ...DEFAULT_FIX_PADDING },
    border_radius: Number(box?.border_radius) > 0 ? box!.border_radius : 4,
  };
}
