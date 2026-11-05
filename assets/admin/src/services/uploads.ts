import { apiCall, ApiError, getConfig } from '@admin/api';
import { __ } from '@admin/i18n';

/**
 * Image uploads for the admin app (Brand kit logo).
 *
 * Same server contract as the editor's `assets/editor/src/services/uploads.ts`
 * (src/Api/Controllers/UploadController.php):
 *
 *  1. `POST /upload/init` `{ filename, mime_type, size_bytes, hash_sha256 }`
 *     → `{ method: 'duplicate', asset }`  same bytes already uploaded
 *     → `{ method: 'direct', url }`       Media Library: POST multipart
 *                                          `file` to `url` → asset (201)
 *     → presigned (S3): `{ url, method, headers, key, … }` — any
 *       response carrying a `key` (its `method` may read "PUT").
 *  2. Presigned only: PUT the bytes to `url` with `Content-Type` = the
 *     file's MIME, then `POST /upload/finalize` → asset (201).
 *
 * The file is sent as-is: the server re-encodes / downsizes oversized
 * images itself. The hash (dedup) uses WebCrypto when the page is a
 * secure context; elsewhere it is sent empty and the server simply
 * skips deduplication.
 */

export interface UploadedAsset {
  id: number;
  url: string;
}

export class AdminUploadError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'AdminUploadError';
    this.code = code;
    this.status = status;
  }
}

/** Raster types the plugin accepts (SVG is refused: email clients block it). */
export const UPLOADABLE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** False when the site runs the URL-only storage driver. */
export function isUploadEnabled(): boolean {
  try {
    return getConfig().uploadEnabled !== false;
  } catch {
    return true;
  }
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
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Uploads an image through `/upload/*` and resolves to the stored
 * asset's id and public URL.
 *
 * @throws AdminUploadError on an unsupported type, disabled uploads or
 *         any server / network failure (message is user-facing).
 */
export async function uploadImage(file: Blob, filename = 'image'): Promise<UploadedAsset> {
  if (!isUploadEnabled()) {
    throw new AdminUploadError(
      'uploads_disabled',
      __('Uploads are disabled on this site — paste an image URL instead.'),
      403,
    );
  }
  const mime = (file.type || '').toLowerCase();
  if (!UPLOADABLE_IMAGE_TYPES.includes(mime)) {
    throw new AdminUploadError(
      'unsupported',
      mime === 'image/svg+xml'
        ? __('SVG images are not supported in email. Use PNG or JPG.')
        : __('Choose a PNG, JPG, WebP or GIF image.'),
    );
  }

  const name = withExtension(filename, mime);
  const hash = await sha256Hex(file);

  const init = await guard(() =>
    apiCall<InitResponse>('/upload/init', {
      method: 'POST',
      body: { filename: name, mime_type: mime, size_bytes: file.size, hash_sha256: hash },
    }),
  );

  if (init.method === 'duplicate' && init.asset) return toUploaded(init.asset);

  if (init.method === 'direct' && init.url) {
    return toUploaded(await postMultipart(init.url, file, name));
  }

  if (init.key && init.url) {
    await putPresigned(init.url, init.method, init.headers ?? {}, file, mime);
    const asset = await guard(() =>
      apiCall<AssetPayload>('/upload/finalize', {
        method: 'POST',
        body: { key: init.key, mime_type: mime, size_bytes: file.size, hash_sha256: hash },
      }),
    );
    return toUploaded(asset);
  }

  throw new AdminUploadError(
    'bad_response',
    __('The server returned an unexpected upload response.'),
  );
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) throw new AdminUploadError(e.code, e.message, e.status);
    throw new AdminUploadError(
      'network',
      __('Upload failed — check your connection and try again.'),
    );
  }
}

async function postMultipart(url: string, file: Blob, filename: string): Promise<AssetPayload> {
  const config = getConfig();
  const form = new FormData();
  form.append('file', file, filename);

  const headers: Record<string, string> = { Accept: 'application/json' };
  // Only hand the REST nonce to our own WordPress origin.
  if (sameOrigin(url, config.apiBase)) headers['X-WP-Nonce'] = config.restNonce;

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', credentials: 'include', headers, body: form });
  } catch {
    throw new AdminUploadError(
      'network',
      __('Upload failed — check your connection and try again.'),
    );
  }

  const payload = (await response.json().catch(() => ({}))) as Partial<AssetPayload> & {
    code?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new AdminUploadError(
      payload.code ?? 'upload_failed',
      payload.message ?? __('Upload failed (HTTP %s).', String(response.status)),
      response.status,
    );
  }
  if (typeof payload.id !== 'number' || typeof payload.public_url !== 'string') {
    throw new AdminUploadError(
      'bad_response',
      __('The server returned an unexpected upload response.'),
    );
  }
  return payload as AssetPayload;
}

async function putPresigned(
  url: string,
  method: string,
  serverHeaders: Record<string, string>,
  file: Blob,
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
    response = await fetch(url, { method: verb, headers, body: file });
  } catch {
    throw new AdminUploadError(
      'network',
      __('Could not reach the storage service. Check its CORS settings and your connection.'),
    );
  }
  if (!response.ok) {
    throw new AdminUploadError(
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

/** Ensures the filename carries the extension the server sniffs for `mime`. */
function withExtension(filename: string, mime: string): string {
  const ext = EXTENSIONS[mime] ?? 'bin';
  const base =
    (filename || 'image')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^\w.\- ]+/g, '')
      .trim() || 'image';
  return `${base}.${ext}`;
}

/** Hex SHA-256 via WebCrypto, or '' where it is unavailable (insecure contexts). */
async function sha256Hex(file: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') return '';
  try {
    const digest = await subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}
