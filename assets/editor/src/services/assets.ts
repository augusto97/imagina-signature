import { apiCall } from '@/bridge/apiClient';

/**
 * The user's uploaded assets (REST `GET /assets`, `DELETE /assets/:id`
 * — src/Api/Controllers/AssetsController.php).
 *
 * `GET /assets?page=&per_page=` (per_page ≤ 200) returns the caller's
 * rows, newest first, as `Asset::to_array()` objects:
 * `{ id, public_url, mime_type, size_bytes, width, height, created_at,
 * storage_key, … }`. Total counts travel in `X-WP-Total` headers, which
 * `apiCall()` does not expose, so "has more" is inferred from a full
 * page. The server keeps no original filename (files are stored under
 * a content hash), so the display name is the URL's last segment.
 */

export interface LibraryAsset {
  id: number;
  url: string;
  mime: string;
  /** Bytes. */
  size: number;
  width: number | null;
  height: number | null;
  /** `Y-m-d H:i:s` UTC as stored, or '' when unknown. */
  createdAt: string;
  /** Display name derived from the URL. */
  filename: string;
}

/** Page size used by the asset library. */
export const ASSET_PAGE_SIZE = 40;

interface AssetRow {
  id?: unknown;
  public_url?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
  width?: unknown;
  height?: unknown;
  created_at?: unknown;
}

export interface AssetPage {
  /** Image assets of the page (other files, e.g. vCards, are skipped). */
  items: LibraryAsset[];
  /** Rows the server returned before filtering (drives pagination). */
  rawCount: number;
  /** A full page came back, so there may be more. */
  hasMore: boolean;
}

/** Normalises a REST row; null when it is unusable. */
export function toLibraryAsset(row: AssetRow): LibraryAsset | null {
  const id = Number(row.id);
  const url = typeof row.public_url === 'string' ? row.public_url : '';
  if (!Number.isFinite(id) || id <= 0 || url === '') return null;
  return {
    id,
    url,
    mime: typeof row.mime_type === 'string' ? row.mime_type.toLowerCase() : '',
    size: Math.max(0, Number(row.size_bytes) || 0),
    width: positiveOrNull(row.width),
    height: positiveOrNull(row.height),
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    filename: assetFilename(url),
  };
}

/** Whether the asset can be used as an image. */
export function isImageAsset(asset: Pick<LibraryAsset, 'mime' | 'url'>): boolean {
  if (asset.mime) return asset.mime.startsWith('image/') && asset.mime !== 'image/svg+xml';
  return /\.(?:png|jpe?g|gif|webp)$/i.test(asset.url.split('?')[0] ?? '');
}

/** Last path segment of `url`, decoded, without query / fragment. */
export function assetFilename(url: string): string {
  const path = url.split(/[?#]/)[0] ?? '';
  const last = path.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** Fetches one page of the user's assets (1-based). */
export async function fetchAssetPage(page: number, perPage = ASSET_PAGE_SIZE): Promise<AssetPage> {
  const rows = await apiCall<unknown>(
    `/assets?page=${Math.max(1, Math.floor(page))}&per_page=${perPage}`,
    { method: 'GET' },
  );
  const list = Array.isArray(rows) ? (rows as AssetRow[]) : [];
  const items = list
    .map(toLibraryAsset)
    .filter((a): a is LibraryAsset => a !== null && isImageAsset(a));
  return { items, rawCount: list.length, hasMore: list.length >= perPage };
}

/** Deletes an asset (row + stored file). */
export async function deleteAsset(id: number): Promise<void> {
  await apiCall(`/assets/${Math.floor(id)}`, { method: 'DELETE' });
}

/**
 * Client-side search: every whitespace-separated term must appear in
 * the filename, the format (`png`, `jpg`…) or the dimensions (`240x240`).
 */
export function filterAssets(items: LibraryAsset[], query: string): LibraryAsset[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;
  return items.filter((a) => {
    const haystack = [
      a.filename.toLowerCase(),
      formatLabel(a.mime),
      a.mime === 'image/jpeg' ? 'jpeg' : '',
      a.width && a.height ? `${a.width}x${a.height}` : '',
    ].join(' ');
    return terms.every((t) => haystack.includes(t.replace('×', 'x')));
  });
}

/** Short format label (`png`, `jpg`, `gif`, `webp`). */
export function formatLabel(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return mime.replace(/^image\//, '');
  }
}

/** Human file size (`812 B`, `24 KB`, `1.4 MB`). */
export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function positiveOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
