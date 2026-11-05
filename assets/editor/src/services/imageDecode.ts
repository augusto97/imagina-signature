import { loadImage } from '@/services/uploads';

/**
 * Image decoding helpers (browser-only).
 *
 * Kept apart from {@link ./imageOptimize} so tests can replace the
 * decoder (jsdom never fires `onload` on `<img>`) while exercising the
 * real optimiser.
 */

export interface NaturalSize {
  width: number;
  height: number;
}

/**
 * Decodes a picked / dropped file into an `<img>` that can be drawn
 * on a canvas. The temporary object URL is revoked once decoded.
 *
 * @throws UploadError('image_load') when the bytes are not an image.
 */
export async function decodeImageBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Loads a remote image for canvas use (CORS-enabled request). Drawing
 * it fails with a CORS error when the host sends no
 * `Access-Control-Allow-Origin` header.
 */
export function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  return loadImage(src);
}

/**
 * Reads the intrinsic pixel size of `src` for display purposes only
 * (resolution hints, aspect ratio). No CORS request is made, so it
 * works for any public image. Resolves `null` on error or timeout.
 */
export function probeImageSize(src: string, timeoutMs = 8000): Promise<NaturalSize | null> {
  return new Promise((resolve) => {
    if (!src || typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    let settled = false;
    const finish = (value: NaturalSize | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      finish(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => finish(null);
    img.src = src;
  });
}
