import { apiCall, ApiError, getConfig, isUploadEnabled } from '@/bridge/apiClient';
import { __ } from '@/i18n/helpers';

/**
 * Hosted-asset uploads for the editor.
 *
 * Email clients do not show `data:` images (Gmail, Outlook.com) and a
 * single embedded photo blows past Gmail's 10,000-character signature
 * limit, so everything the signature references — cropped photos, QR
 * PNGs, vCard files — is uploaded and referenced by its public URL.
 *
 * Server contract (src/Api/Controllers/UploadController.php):
 *
 *  1. `POST /upload/init` `{ filename, mime_type, size_bytes, hash_sha256 }`
 *     → `{ method: 'duplicate', asset }`  same bytes already uploaded
 *     → `{ method: 'direct', url }`       Media Library: POST multipart
 *                                          `file` to `url` → asset (201)
 *     → presigned (S3): `{ url, method, headers, key, public_url, … }`.
 *       NOTE: the server builds this with
 *       `array_merge(['method' => 'presigned'], $presigned->to_array())`
 *       and the DTO's own `method` (the HTTP verb, "PUT") wins the
 *       merge, so the response's `method` may be "PUT" rather than
 *       "presigned". Both are handled: any response carrying a `key` is
 *       the presigned flow.
 *  2. Presigned only: PUT the bytes to `url` with `Content-Type` equal to
 *     the blob's MIME (it is part of the signature), then
 *     `POST /upload/finalize` `{ key, mime_type, size_bytes, hash_sha256,
 *     width?, height? }` → asset (201).
 *
 * Asset rows come back as `{ id, public_url, … }`.
 */

export interface UploadedAsset {
  id: number;
  url: string;
}

export interface UploadMeta {
  width?: number;
  height?: number;
}

export class UploadError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
    this.status = status;
  }
}

/** Thrown when the site runs the URL-only storage driver. */
export class UploadsDisabledError extends UploadError {
  constructor() {
    super(
      'uploads_disabled',
      __('Uploads are disabled on this site — paste an image URL instead.'),
      403,
    );
    this.name = 'UploadsDisabledError';
  }
}

export function isUploadsDisabledError(e: unknown): e is UploadsDisabledError {
  return e instanceof UploadsDisabledError;
}

/** Human-readable message for any error thrown by this module. */
export function uploadErrorMessage(e: unknown): string {
  if (e instanceof UploadError || e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return __('Upload failed.');
}

interface AssetPayload {
  id: number;
  public_url: string;
}

interface InitResponse {
  method: string;
  url?: string;
  asset?: AssetPayload;
  headers?: Record<string, string>;
  key?: string;
  public_url?: string;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/vcard': 'vcf',
  'text/x-vcard': 'vcf',
};

/**
 * Uploads `blob` through the plugin's `/upload/*` flow and resolves to
 * the stored asset's id and public URL.
 *
 * @throws UploadsDisabledError  in URL-only storage mode.
 * @throws UploadError / ApiError on any server or network failure.
 */
export async function uploadBlob(
  blob: Blob,
  filename: string,
  meta: UploadMeta = {},
): Promise<UploadedAsset> {
  if (!isUploadEnabled()) throw new UploadsDisabledError();

  const mime = (
    blob.type ||
    mimeFromFilename(filename) ||
    'application/octet-stream'
  ).toLowerCase();
  const name = withExtension(filename, mime);
  const bytes = new Uint8Array(await blobToArrayBuffer(blob));
  const hash = await sha256Hex(bytes);

  const init = await guard(() =>
    apiCall<InitResponse>('/upload/init', {
      method: 'POST',
      body: { filename: name, mime_type: mime, size_bytes: blob.size, hash_sha256: hash },
    }),
  );

  if (init.method === 'duplicate' && init.asset) {
    return toUploaded(init.asset);
  }

  if (init.method === 'direct' && init.url) {
    return toUploaded(await postMultipart(init.url, blob, name));
  }

  if (init.key && init.url) {
    await putPresigned(init.url, init.method, init.headers ?? {}, blob, mime);
    const finalizeBody: Record<string, unknown> = {
      key: init.key,
      mime_type: mime,
      size_bytes: blob.size,
      hash_sha256: hash,
    };
    if (meta.width) finalizeBody.width = Math.round(meta.width);
    if (meta.height) finalizeBody.height = Math.round(meta.height);
    const asset = await guard(() =>
      apiCall<AssetPayload>('/upload/finalize', { method: 'POST', body: finalizeBody }),
    );
    return toUploaded(asset);
  }

  throw new UploadError('bad_response', __('The server returned an unexpected upload response.'));
}

/** Maps the server's "uploads disabled" error onto the typed error. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.code === 'imgsig_uploads_disabled') {
      throw new UploadsDisabledError();
    }
    if (e instanceof ApiError) {
      throw new UploadError(e.code, e.message, e.status);
    }
    if (e instanceof UploadError) throw e;
    throw new UploadError('network', __('Upload failed — check your connection and try again.'));
  }
}

async function postMultipart(url: string, blob: Blob, filename: string): Promise<AssetPayload> {
  const config = getConfig();
  const form = new FormData();
  form.append('file', blob, filename);

  const headers: Record<string, string> = { Accept: 'application/json' };
  // Only hand the REST nonce to our own WordPress origin.
  if (sameOrigin(url, config.apiBase)) headers['X-WP-Nonce'] = config.restNonce;

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', credentials: 'include', headers, body: form });
  } catch {
    throw new UploadError('network', __('Upload failed — check your connection and try again.'));
  }

  const payload = (await response.json().catch(() => ({}))) as Partial<AssetPayload> & {
    code?: string;
    message?: string;
  };
  if (!response.ok) {
    if (payload.code === 'imgsig_uploads_disabled') throw new UploadsDisabledError();
    throw new UploadError(
      payload.code ?? 'upload_failed',
      payload.message ?? __('Upload failed (HTTP %s).', String(response.status)),
      response.status,
    );
  }
  if (typeof payload.id !== 'number' || typeof payload.public_url !== 'string') {
    throw new UploadError('bad_response', __('The server returned an unexpected upload response.'));
  }
  return payload as AssetPayload;
}

async function putPresigned(
  url: string,
  method: string,
  serverHeaders: Record<string, string>,
  blob: Blob,
  mime: string,
): Promise<void> {
  const verb = /^(PUT|POST)$/i.test(method) ? method.toUpperCase() : 'PUT';
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(serverHeaders)) {
    if (k.toLowerCase() !== 'content-type') headers[k] = v;
  }
  // Must match the Content-Type the URL was signed with.
  headers['Content-Type'] = mime;

  let response: Response;
  try {
    response = await fetch(url, { method: verb, headers, body: blob });
  } catch {
    throw new UploadError(
      'network',
      __('Could not reach the storage service. Check its CORS settings and your connection.'),
    );
  }
  if (!response.ok) {
    throw new UploadError(
      'storage_rejected',
      __('The storage service rejected the upload (HTTP %s).', String(response.status)),
      response.status,
    );
  }
}

function toUploaded(asset: AssetPayload): UploadedAsset {
  return { id: Number(asset.id), url: String(asset.public_url) };
}

function sameOrigin(a: string, b: string): boolean {
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    return new URL(a, base).origin === new URL(b, base).origin;
  } catch {
    return false;
  }
}

export function mimeFromFilename(filename: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'vcf':
      return 'text/vcard';
    default:
      return '';
  }
}

/** Ensures the filename carries the extension the server sniffs for `mime`. */
export function withExtension(filename: string, mime: string): string {
  const ext = EXTENSIONS[mime];
  const base = (filename || 'upload').replace(/[^\w.\- ]+/g, '').trim() || 'upload';
  if (!ext) return base;
  if (mimeFromFilename(base) === mime || (ext === 'jpg' && /\.jpe?g$/i.test(base))) return base;
  return `${base.replace(/\.[a-z0-9]+$/i, '')}.${ext}`;
}

// ---------------------------------------------------------------------------
// Bytes / hashing
// ---------------------------------------------------------------------------

export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Hex SHA-256 — WebCrypto when available (secure contexts), JS otherwise. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    try {
      const copy = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const digest = await subtle.digest('SHA-256', copy);
      return toHex(new Uint8Array(digest));
    } catch {
      // Fall through to the JS implementation.
    }
  }
  return sha256HexSync(bytes);
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Pure-JS SHA-256 (used outside secure contexts, where WebCrypto is missing). */
export function sha256HexSync(bytes: Uint8Array): string {
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((v, i) => outView.setUint32(i * 4, v));
  return toHex(out);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Image helpers (browser-only: need <canvas>)
// ---------------------------------------------------------------------------

/** Largest pixel width we ever upload for a signature image. */
export const MAX_IMAGE_PIXEL_WIDTH = 1200;

/** Pixel width to render an image shown at `displayWidth` CSS px (2× for HiDPI, cap 1200). */
export function targetPixelWidth(displayWidth: number): number {
  const w = Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : 600;
  return Math.max(1, Math.min(MAX_IMAGE_PIXEL_WIDTH, Math.round(w * 2)));
}

/** Decodes a `data:` URI into a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^,]*?),(.*)$/s.exec(dataUrl.trim());
  if (!m) throw new UploadError('bad_data_url', __('This embedded file could not be read.'));
  const header = m[1] ?? '';
  const payload = m[2] ?? '';
  const isBase64 = /;base64$/i.test(header);
  const mime = (
    header.replace(/;base64$/i, '').split(';')[0] || 'application/octet-stream'
  ).toLowerCase();
  if (isBase64) {
    const binary = atob(payload.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!/^(?:data|blob):/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new UploadError('image_load', __('The image could not be loaded for processing.')));
    img.src = src;
  });
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderImageOptions {
  /** Region of the source, in source pixels. Defaults to the whole image. */
  crop?: CropArea;
  /** Maximum output width in pixels (never upscales). */
  maxWidth: number;
  /** Centre-crop to a square when no `crop` is given. */
  square?: boolean;
  /** PNG with a true circular alpha mask (implies square). */
  circular?: boolean;
}

export interface RenderedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
}

/**
 * Crops / resizes `image` on a canvas and encodes it:
 *  - `circular` → PNG with a circular alpha mask (renders round even in
 *    Outlook, which ignores border-radius);
 *  - otherwise JPEG q~0.88, or PNG when the result has transparency.
 *
 * @throws UploadError('cors') when the canvas is tainted by a cross-
 *         origin image served without CORS headers.
 */
export async function renderImage(
  image: HTMLImageElement,
  options: RenderImageOptions,
): Promise<RenderedImage> {
  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;
  let crop = options.crop ?? { x: 0, y: 0, width: naturalW, height: naturalH };
  if (!options.crop && (options.square || options.circular)) {
    const side = Math.min(naturalW, naturalH);
    crop = { x: (naturalW - side) / 2, y: (naturalH - side) / 2, width: side, height: side };
  }
  if (crop.width <= 0 || crop.height <= 0) {
    throw new UploadError('image_empty', __('The image is empty.'));
  }

  const outW = Math.max(1, Math.min(Math.round(crop.width), Math.round(options.maxWidth)));
  const outH = Math.max(1, Math.round((crop.height * outW) / crop.width));

  // Step down by halves first for a sharper large downscale.
  let source: CanvasImageSource = image;
  let sx = crop.x;
  let sy = crop.y;
  let sw = crop.width;
  let sh = crop.height;
  while (sw / 2 >= outW * 1.5) {
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
  ctx.imageSmoothingQuality = 'high';
  if (options.circular) {
    ctx.beginPath();
    ctx.arc(outW / 2, outH / 2, Math.min(outW, outH) / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);

  let mime = 'image/jpeg';
  try {
    if (options.circular || hasTransparency(ctx, outW, outH)) mime = 'image/png';
  } catch {
    throw corsError();
  }
  const blob = await canvasToBlob(canvas, mime, mime === 'image/jpeg' ? 0.88 : undefined);
  return { blob, width: outW, height: outH, mime };
}

/**
 * Prepares a user-picked file for upload: animated GIFs are kept as-is
 * (re-encoding would flatten them) unless a circular mask is needed;
 * everything else is resized to {@link targetPixelWidth}.
 */
export async function prepareImageFile(
  file: Blob,
  options: { displayWidth: number; square?: boolean; circular?: boolean },
): Promise<RenderedImage> {
  if (file.type === 'image/svg+xml') {
    throw new UploadError(
      'unsupported',
      __('SVG images are not supported in email. Use PNG or JPG.'),
    );
  }
  if (file.type === 'image/gif' && !options.circular && !options.square) {
    return { blob: file, width: 0, height: 0, mime: 'image/gif' };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return await renderImage(img, {
      maxWidth: targetPixelWidth(options.displayWidth),
      square: options.square,
      circular: options.circular,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Base filename (no extension) for an upload derived from a label. */
export function slugFilename(label: string, fallback: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? 'bin';
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < 255) return true;
  }
  return false;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new UploadError('encode', __('The image could not be encoded.'))),
        mime,
        quality,
      );
    } catch {
      reject(corsError());
    }
  });
}

function corsError(): UploadError {
  return new UploadError(
    'cors',
    __(
      "This image's host does not allow editing it here (CORS). Download it and use Upload instead.",
    ),
  );
}
