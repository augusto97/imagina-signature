import { isUploadEnabled } from '@/bridge/apiClient';
import { safeColor } from '@/core/compiler/css';
import { __ } from '@/i18n/helpers';
import { decodeImageBlob } from '@/services/imageDecode';
import {
  blobToArrayBuffer,
  canvasToBlob,
  extensionFor,
  targetPixelWidth,
  uploadBlob,
  UploadError,
  UploadsDisabledError,
  type CropArea,
  type UploadedAsset,
} from '@/services/uploads';

/**
 * Client-side image optimisation — the ONE path every image upload
 * goes through (asset library drop zone, the blocks' Upload buttons,
 * the cropper and the avatar mask renderer).
 *
 * Rules:
 *  - resize to at most 2× the width the image is displayed at (HiDPI),
 *    never above 1200 px and never upscaled;
 *  - PNG when the result has transparency (or a shape mask), JPEG at
 *    q 0.85 otherwise. An opaque PNG source is also re-encoded as PNG
 *    and the smaller file wins, so flat-colour logos stay crisp;
 *  - WebP is always converted (Outlook desktop cannot show it);
 *  - when the pixels did not change (no resize / crop / mask) and the
 *    original JPEG / PNG is already smaller, the original bytes are
 *    kept — re-encoding never makes a file worse;
 *  - GIFs are uploaded untouched (re-encoding would drop the
 *    animation) with a warning above 1 MB, unless a crop or mask is
 *    requested, in which case the first frame is flattened;
 *  - SVG is rejected (no email client renders it).
 *
 * `browser-image-compression` is deliberately not used: its default
 * web-worker mode loads the library from a CDN at runtime (forbidden
 * by CLAUDE.md §1.4) and the canvas path below covers the same needs.
 */

/** JPEG quality used for every re-encoded opaque image. */
export const JPEG_QUALITY = 0.85;

/** Animated GIFs above this size get a warning (they are not resized). */
export const GIF_WARN_BYTES = 1024 * 1024;

/** `accept` attribute for every image file input. */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

/** Corner radius of the `rounded` shape, as a fraction of the shorter side. */
export const ROUNDED_RADIUS_RATIO = 0.2;

const SUPPORTED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export type MaskShape = 'circle' | 'rounded' | 'square';

export interface ImageMask {
  shape: MaskShape;
  /** Ring (outline) width in CSS px, relative to `displayWidth`. */
  ringWidth?: number;
  ringColor?: string;
}

export interface OptimizeOptions {
  /** CSS px width the image is displayed at in the signature. */
  displayWidth: number;
  /** Region of the source to keep, in source pixels. */
  crop?: CropArea;
  /** Centre-crop to a square when no `crop` is given. */
  square?: boolean;
  /** Bake a shape mask (and optional ring) into the pixels. Implies `square`. */
  mask?: ImageMask;
}

export interface OptimizedImage {
  blob: Blob;
  /** Pixel size of `blob` (0 when unknown). */
  width: number;
  height: number;
  mime: string;
  /** False when the original bytes are uploaded unchanged. */
  reencoded: boolean;
  /** Translated, user-facing notes (e.g. a heavy GIF). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Pure decisions (unit-tested)
// ---------------------------------------------------------------------------

export type SourceDecision =
  | { action: 'reject'; message: string }
  | { action: 'passthrough' }
  | { action: 'render' };

/**
 * What to do with a source file of `mime`. `transform` is true when a
 * crop or mask was requested (forces a GIF through the renderer).
 */
export function decideSource(mime: string, transform: boolean): SourceDecision {
  const m = mime.toLowerCase();
  if (m === 'image/svg+xml') {
    return {
      action: 'reject',
      message: __('SVG images are not supported in email. Use PNG or JPG.'),
    };
  }
  if (m !== '' && !SUPPORTED_MIMES.has(m)) {
    return {
      action: 'reject',
      message: __('This file type is not supported. Use a PNG, JPG, WebP or GIF image.'),
    };
  }
  if (m === 'image/gif' && !transform) return { action: 'passthrough' };
  return { action: 'render' };
}

/**
 * Output pixel size for a `srcWidth × srcHeight` region shown at
 * `displayWidth` CSS px: ≤ 2× display width, ≤ 1200 px, never upscaled.
 */
export function outputSize(
  srcWidth: number,
  srcHeight: number,
  displayWidth: number,
): { width: number; height: number; resized: boolean } {
  const sw = Math.max(1, Math.round(srcWidth));
  const sh = Math.max(1, Math.round(srcHeight));
  const width = Math.max(1, Math.min(sw, targetPixelWidth(displayWidth)));
  const height = Math.max(1, Math.round((sh * width) / sw));
  return { width, height, resized: width < sw };
}

/**
 * Encodings to try, best guess first; the smallest result wins.
 *  - masked (circle / rounded) or transparent → PNG only;
 *  - opaque PNG source → JPEG and PNG (flat graphics compress better
 *    losslessly);
 *  - anything else opaque → JPEG.
 */
export function candidateMimes(input: {
  sourceMime: string;
  hasAlpha: boolean;
  masked: boolean;
}): Array<'image/png' | 'image/jpeg'> {
  if (input.masked || input.hasAlpha) return ['image/png'];
  if (input.sourceMime.toLowerCase() === 'image/png') return ['image/jpeg', 'image/png'];
  return ['image/jpeg'];
}

/**
 * Whether to upload the original bytes instead of the re-encoded
 * result: only when no pixel changed (no resize / crop / mask), the
 * original is a format every client shows (JPEG / PNG — WebP must be
 * converted) and it is not larger than the re-encode.
 */
export function keepOriginalBytes(input: {
  sourceMime: string;
  sourceBytes: number;
  outputBytes: number;
  pixelsChanged: boolean;
}): boolean {
  if (input.pixelsChanged) return false;
  const m = input.sourceMime.toLowerCase();
  if (m !== 'image/jpeg' && m !== 'image/png') return false;
  return input.sourceBytes > 0 && input.sourceBytes <= input.outputBytes;
}

/** Translated warnings for a GIF uploaded as-is. */
export function gifWarnings(bytes: number): string[] {
  if (bytes <= GIF_WARN_BYTES) return [];
  return [
    __(
      'This GIF is %s MB. Animated GIFs are uploaded as they are; files this large load slowly and some email clients clip them — aim for under 1 MB.',
      (bytes / (1024 * 1024)).toFixed(1),
    ),
  ];
}

/** Width / height from a GIF header (logical screen descriptor), or null. */
export function readGifSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 10) return null;
  const signature = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (signature !== 'GIF8') return null;
  const width = bytes[6]! | (bytes[7]! << 8);
  const height = bytes[8]! | (bytes[9]! << 8);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Corner radius (output px) for a mask shape on a `w × h` box. */
export function shapeRadius(shape: MaskShape, w: number, h: number): number {
  const side = Math.min(w, h);
  if (shape === 'circle') return side / 2;
  if (shape === 'rounded') return Math.round(side * ROUNDED_RADIUS_RATIO);
  return 0;
}

// ---------------------------------------------------------------------------
// Rendering (canvas)
// ---------------------------------------------------------------------------

/** Anything `drawImage` accepts that also reports its intrinsic size. */
export type DecodedImage = CanvasImageSource & {
  naturalWidth?: number;
  naturalHeight?: number;
  width: number;
  height: number;
};

/**
 * Optimises a picked / dropped file. See the module docblock for the
 * rules.
 *
 * @throws UploadError for unsupported files, undecodable bytes or a
 *         canvas the browser refuses to read.
 */
export async function optimizeImageFile(
  file: Blob,
  options: OptimizeOptions,
): Promise<OptimizedImage> {
  const mime = (file.type || '').toLowerCase();
  const transform = Boolean(options.crop || options.square || options.mask);
  const decision = decideSource(mime, transform);
  if (decision.action === 'reject') throw new UploadError('unsupported', decision.message);

  if (decision.action === 'passthrough') {
    const header = new Uint8Array(await blobToArrayBuffer(file.slice(0, 10)));
    const size = readGifSize(header) ?? { width: 0, height: 0 };
    return {
      blob: file,
      width: size.width,
      height: size.height,
      mime: 'image/gif',
      reencoded: false,
      warnings: gifWarnings(file.size),
    };
  }

  const image = await decodeImageBlob(file);
  return optimizeImageElement(image, options, { blob: file, mime });
}

/**
 * Optimises an already-decoded image (cropper, avatar mask renderer).
 * Pass `original` when the source bytes are at hand so they can be
 * kept when re-encoding would not help.
 */
export async function optimizeImageElement(
  image: DecodedImage,
  options: OptimizeOptions,
  original?: { blob: Blob; mime: string },
): Promise<OptimizedImage> {
  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;
  const full: CropArea = { x: 0, y: 0, width: naturalW, height: naturalH };
  let crop = options.crop ?? full;
  if (!options.crop && (options.square || options.mask)) {
    const side = Math.min(naturalW, naturalH);
    crop = { x: (naturalW - side) / 2, y: (naturalH - side) / 2, width: side, height: side };
  }
  if (!(crop.width > 0) || !(crop.height > 0)) {
    throw new UploadError('image_empty', __('The image is empty.'));
  }

  const { width: outW, height: outH } = outputSize(crop.width, crop.height, options.displayWidth);
  const { canvas, ctx } = drawRegion(image, crop, outW, outH, options.mask, options.displayWidth);
  const masked = Boolean(options.mask && options.mask.shape !== 'square');

  let hasAlpha = false;
  if (!masked && original?.mime !== 'image/jpeg') {
    try {
      hasAlpha = canvasHasAlpha(ctx, outW, outH);
    } catch {
      throw corsError();
    }
  }

  let best: { blob: Blob; mime: string } | null = null;
  for (const mime of candidateMimes({ sourceMime: original?.mime ?? '', hasAlpha, masked })) {
    const blob = await canvasToBlob(canvas, mime, mime === 'image/jpeg' ? JPEG_QUALITY : undefined);
    if (!best || blob.size < best.blob.size) best = { blob, mime };
  }
  if (!best) throw new UploadError('encode', __('The image could not be encoded.'));

  const pixelsChanged =
    outW !== Math.round(naturalW) ||
    outH !== Math.round(naturalH) ||
    crop.x !== 0 ||
    crop.y !== 0 ||
    Boolean(options.mask);
  if (
    original &&
    keepOriginalBytes({
      sourceMime: original.mime,
      sourceBytes: original.blob.size,
      outputBytes: best.blob.size,
      pixelsChanged,
    })
  ) {
    return {
      blob: original.blob,
      width: Math.round(naturalW),
      height: Math.round(naturalH),
      mime: original.mime,
      reencoded: false,
      warnings: [],
    };
  }

  return { blob: best.blob, width: outW, height: outH, mime: best.mime, reencoded: true, warnings: [] };
}

// ---------------------------------------------------------------------------
// Upload helpers — optimise, then `/upload/*`
// ---------------------------------------------------------------------------

export interface OptimizedUpload {
  asset: UploadedAsset;
  image: OptimizedImage;
}

/** Uploads an already optimised image. */
export async function uploadOptimizedImage(
  image: OptimizedImage,
  filenameBase: string,
): Promise<UploadedAsset> {
  return uploadBlob(
    image.blob,
    `${filenameBase}.${extensionFor(image.mime)}`,
    image.width ? { width: image.width, height: image.height } : {},
  );
}

/**
 * Optimises `file` for `options.displayWidth` and uploads it.
 *
 * @throws UploadsDisabledError in URL-only storage mode (before any
 *         work is done); UploadError / ApiError otherwise.
 */
export async function optimizeAndUpload(
  file: Blob,
  options: OptimizeOptions & { filenameBase: string },
): Promise<OptimizedUpload> {
  if (!isUploadEnabled()) throw new UploadsDisabledError();
  const image = await optimizeImageFile(file, options);
  const asset = await uploadOptimizedImage(image, options.filenameBase);
  return { asset, image };
}

// ---------------------------------------------------------------------------
// Canvas internals
// ---------------------------------------------------------------------------

function drawRegion(
  image: DecodedImage,
  crop: CropArea,
  outW: number,
  outH: number,
  mask: ImageMask | undefined,
  displayWidth: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  // Ring and inner photo area, in output pixels.
  let ring = 0;
  if (mask && (mask.ringWidth ?? 0) > 0) {
    const scale = outW / Math.max(1, displayWidth);
    ring = Math.min(Math.floor(Math.min(outW, outH) / 2) - 1, Math.round(mask.ringWidth! * scale));
    ring = Math.max(0, ring);
  }
  const innerW = outW - ring * 2;
  const innerH = outH - ring * 2;

  // Step down by halves first for a sharper large downscale.
  let source: CanvasImageSource = image;
  let sx = crop.x;
  let sy = crop.y;
  let sw = crop.width;
  let sh = crop.height;
  while (sw / 2 >= innerW * 1.5) {
    const half = createCanvas(Math.round(sw / 2), Math.round(sh / 2));
    const hctx = half.getContext('2d');
    if (!hctx) break;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(source, sx, sy, sw, sh, 0, 0, half.width, half.height);
    source = half;
    sx = 0;
    sy = 0;
    sw = half.width;
    sh = half.height;
  }

  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UploadError('canvas', __('Your browser cannot process images here.'));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (mask) {
    const radius = shapeRadius(mask.shape, outW, outH);
    if (ring > 0) {
      ctx.save();
      shapePath(ctx, 0, 0, outW, outH, radius);
      ctx.fillStyle = safeColor(mask.ringColor, '#ffffff');
      ctx.fill();
      ctx.restore();
    }
    shapePath(ctx, ring, ring, innerW, innerH, Math.max(0, radius - ring));
    ctx.clip();
  }
  ctx.drawImage(source, sx, sy, sw, sh, ring, ring, innerW, innerH);
  return { canvas, ctx };
}

/** Rounded-rectangle path (a circle when `r` is half the side). */
function shapePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (rr === 0) {
    ctx.rect(x, y, w, h);
  } else {
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
  }
  ctx.closePath();
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasHasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < 255) return true;
  }
  return false;
}

function corsError(): UploadError {
  return new UploadError(
    'cors',
    __(
      "This image's host does not allow editing it here (CORS). Download it and use Upload instead.",
    ),
  );
}
