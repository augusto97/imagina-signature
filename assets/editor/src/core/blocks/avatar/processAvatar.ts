import type { AvatarBlock } from '@/core/schema/blocks';
import { decodeImageBlob, loadImageForCanvas, probeImageSize } from '@/services/imageDecode';
import { optimizeImageElement, uploadOptimizedImage, type DecodedImage } from '@/services/imageOptimize';
import type { AvatarRenderSpec } from './model';

/**
 * Renders an avatar's `src` from its source photo: centre square crop,
 * shape mask (circle / rounded) and ring baked into a PNG, uploaded
 * through the shared optimiser. A square avatar without ring whose
 * source is already square uses the source as-is (no upload).
 */

/**
 * Bytes of sources uploaded in this session, keyed by public URL — so
 * re-rendering after a shape / ring change does not need a CORS
 * re-download of an image we just sent. Bounded.
 */
const sessionSources = new Map<string, Blob>();
const MAX_CACHED_SOURCES = 8;

export function rememberAvatarSource(url: string, blob: Blob | undefined): void {
  if (!url || !blob) return;
  sessionSources.delete(url);
  sessionSources.set(url, blob);
  while (sessionSources.size > MAX_CACHED_SOURCES) {
    const oldest = sessionSources.keys().next().value;
    if (oldest === undefined) break;
    sessionSources.delete(oldest);
  }
}

async function loadSource(url: string): Promise<DecodedImage> {
  const cached = sessionSources.get(url);
  if (cached) {
    try {
      return await decodeImageBlob(cached);
    } catch {
      sessionSources.delete(url);
    }
  }
  return loadImageForCanvas(url);
}

export type AvatarRenderResult = Pick<AvatarBlock, 'src' | 'processed'>;

/**
 * Produces the `src` + `processed` fields for `spec`.
 *
 * @throws UploadError (CORS, decode, upload) — callers keep the CSS
 *         rendering and show the message.
 */
export async function renderAvatar(spec: AvatarRenderSpec): Promise<AvatarRenderResult> {
  if (spec.shape === 'square' && spec.ring_width === 0 && !sessionSources.has(spec.source_url)) {
    // Dimensions only — no CORS needed.
    const size = await probeImageSize(spec.source_url);
    if (size && Math.abs(size.width - size.height) <= 1) {
      return { src: spec.source_url, processed: { ...spec } };
    }
  }

  const image = await loadSource(spec.source_url);
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (spec.shape === 'square' && spec.ring_width === 0 && Math.abs(w - h) <= 1) {
    return { src: spec.source_url, processed: { ...spec } };
  }

  const rendered = await optimizeImageElement(image, {
    displayWidth: spec.size,
    mask: { shape: spec.shape, ringWidth: spec.ring_width, ringColor: spec.ring_color },
  });
  const asset = await uploadOptimizedImage(rendered, 'avatar');
  return { src: asset.url, processed: { ...spec } };
}
