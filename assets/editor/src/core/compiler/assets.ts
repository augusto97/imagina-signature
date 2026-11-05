import { getConfig } from '@/bridge/apiClient';

/**
 * Where the exported email loads the plugin's own static assets from
 * (the hosted PNG icon set in `assets/icons/`).
 *
 * Email clients render neither inline SVG nor `data:` images, so icons
 * are referenced by ABSOLUTE URL on the customer's own site:
 * `<pluginUrl>/assets/icons/<shape>-<tone>/<name>.png`.
 *
 * The base is set once at boot (`main.tsx` → {@link initAssetsBaseUrl})
 * from `IMGSIG_EDITOR_CONFIG.pluginUrl`. Tests override it with
 * {@link setAssetsBaseUrl}. When nothing was set, the bootstrap config
 * is read lazily, so a compile that runs before boot still resolves.
 */

export type IconShape = 'circle' | 'rounded' | 'plain';
export type IconTone = 'brand' | 'dark' | 'gray' | 'light';

export const ICON_SHAPES: readonly IconShape[] = ['circle', 'rounded', 'plain'];
export const ICON_TONES: readonly IconTone[] = ['brand', 'dark', 'gray', 'light'];

const ICON_NAME = /^[a-z0-9][a-z0-9-]*$/;

let explicitBase: string | null = null;

/**
 * Sets the assets base URL (the plugin root, no trailing slash
 * needed). A relative value is resolved against the current page.
 * `null` clears the override (back to the bootstrap config).
 */
export function setAssetsBaseUrl(url: string | null): void {
  explicitBase = url === null ? null : normaliseBase(url);
}

/** Reads `pluginUrl` from the bootstrap config. Safe to call anywhere. */
export function initAssetsBaseUrl(): void {
  try {
    setAssetsBaseUrl(getConfig().pluginUrl ?? '');
  } catch {
    // No bootstrap config (standalone preview) — keep the lazy fallback.
  }
}

/** The assets base URL without a trailing slash, or '' when unknown. */
export function getAssetsBaseUrl(): string {
  if (explicitBase !== null) return explicitBase;
  try {
    return normaliseBase(getConfig().pluginUrl ?? '');
  } catch {
    return '';
  }
}

export function isIconShape(value: unknown): value is IconShape {
  return typeof value === 'string' && (ICON_SHAPES as readonly string[]).includes(value);
}

export function isIconTone(value: unknown): value is IconTone {
  return typeof value === 'string' && (ICON_TONES as readonly string[]).includes(value);
}

/**
 * Absolute URL of one hosted icon PNG. Invalid input never reaches the
 * path: an unknown shape / tone falls back to circle / brand and a
 * malformed name to the generic `link` glyph.
 */
export function iconUrl(name: string, shape: IconShape, tone: IconTone): string {
  const safeName = ICON_NAME.test(name) ? name : 'link';
  const safeShape = isIconShape(shape) ? shape : 'circle';
  const safeTone = isIconTone(tone) ? tone : 'brand';
  return `${getAssetsBaseUrl()}/assets/icons/${safeShape}-${safeTone}/${safeName}.png`;
}

function normaliseBase(url: string): string {
  const trimmed = String(url).trim();
  if (trimmed === '') return '';
  let absolute = trimmed;
  if (!/^https?:\/\//i.test(trimmed) && typeof window !== 'undefined' && window.location) {
    try {
      absolute = new URL(trimmed, window.location.href).href;
    } catch {
      absolute = trimmed;
    }
  }
  return absolute.replace(/\/+$/, '');
}
