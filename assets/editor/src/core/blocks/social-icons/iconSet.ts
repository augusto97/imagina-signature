import { __ } from '@/i18n/helpers';
import type { IconShape, IconTone } from '@/core/compiler/assets';
import manifestJson from '../../../../../icons/manifest.json';

/**
 * Typed view of `assets/icons/manifest.json`, written by
 * `scripts/icons/generate.mjs` next to the PNGs it describes. Shared by
 * the Social icons and Contact blocks (pickers, alt text, swatches).
 */
export interface IconManifestEntry {
  /** Display name (brand names are proper nouns; generic ones get translated). */
  title: string;
  /** Brand colour (`#rrggbb`). */
  color: string;
  /** Available `<shape>-<tone>` folders. */
  variants: string[];
}

export interface IconManifest {
  version: number;
  /** Pixel edge of every PNG. */
  size: number;
  shapes: IconShape[];
  tones: IconTone[];
  toneColors: Record<Exclude<IconTone, 'brand'>, string>;
  /** Network picker order of the Social icons block. */
  social: string[];
  /** Icons the Contact block uses. */
  contact: string[];
  icons: Record<string, IconManifestEntry>;
}

export const ICON_MANIFEST = manifestJson as unknown as IconManifest;

/** Networks offered by the Social icons picker, in display order. */
export const SOCIAL_NETWORKS: readonly string[] = ICON_MANIFEST.social;

export function hasIcon(name: unknown): name is string {
  return (
    typeof name === 'string' && Object.prototype.hasOwnProperty.call(ICON_MANIFEST.icons, name)
  );
}

/** Translated names for the generic (non-brand) glyphs. */
const GENERIC_TITLES: Record<string, () => string> = {
  website: () => __('Website'),
  email: () => __('Email'),
  phone: () => __('Phone'),
  mobile: () => __('Mobile'),
  address: () => __('Address'),
  calendar: () => __('Calendar'),
  link: () => __('Link'),
};

/** Human name of an icon ("LinkedIn", "Website"…), used for alt text and pickers. */
export function iconTitle(name: string): string {
  const generic = GENERIC_TITLES[name];
  if (generic) return generic();
  return ICON_MANIFEST.icons[name]?.title ?? name;
}

/** Brand colour of an icon (picker swatches); generic blue when unknown. */
export function iconColor(name: string): string {
  return ICON_MANIFEST.icons[name]?.color ?? '#2563eb';
}

/** Translated label of an icon shape. */
export function shapeLabel(shape: IconShape): string {
  switch (shape) {
    case 'circle':
      return __('Circle');
    case 'rounded':
      return __('Rounded');
    default:
      return __('Icon only');
  }
}

/** Translated label of an icon tone. */
export function toneLabel(tone: IconTone): string {
  switch (tone) {
    case 'brand':
      return __('Brand colors');
    case 'dark':
      return __('Dark');
    case 'gray':
      return __('Gray');
    default:
      return __('White (for dark backgrounds)');
  }
}
