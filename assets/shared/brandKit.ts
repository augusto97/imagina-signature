/**
 * Company brand kit — shared by the admin app (Settings → Brand kit)
 * and the editor (`IMGSIG_EDITOR_CONFIG.brandKit`, new-signature
 * defaults).
 *
 * Mirrors `src/Settings/BrandKit.php`, which is authoritative: it
 * sanitises every write and always returns this exact shape.
 */

// i18n-ignore-file — the only literals here are font family names, never translated.

/** Company profile networks, in display order. */
export const BRAND_KIT_SOCIAL_NETWORKS = [
  'linkedin',
  'x',
  'facebook',
  'instagram',
  'youtube',
  'tiktok',
  'github',
  'whatsapp',
] as const;

export type BrandKitSocialNetwork = (typeof BRAND_KIT_SOCIAL_NETWORKS)[number];

export interface BrandKitCompany {
  name: string;
  tagline: string;
  /** http(s) URL or ''. */
  website: string;
  phone: string;
  email: string;
  address: string;
  /** http(s) URL of the logo image or ''. */
  logo_url: string;
  /** Logo display width in px (16–600). */
  logo_width: number;
}

export interface BrandKitTypography {
  /** One of {@link BRAND_KIT_FONTS}. */
  font_family: string;
  text_color: string;
  link_color: string;
  accent_color: string;
}

export interface BrandKit {
  company: BrandKitCompany;
  social: Record<BrandKitSocialNetwork, string>;
  typography: BrandKitTypography;
}

/**
 * Web-safe font stacks the kit may use — the same values the editor's
 * `FontFamilyInput` offers and `BrandKit::FONT_FAMILIES` accepts.
 */
export const BRAND_KIT_FONTS = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
] as const;

/** Default typography — identical to a new signature's canvas. */
export const DEFAULT_BRAND_TYPOGRAPHY: BrandKitTypography = {
  font_family: 'Arial, sans-serif',
  text_color: '#111827',
  link_color: '#1d4ed8',
  accent_color: '#2563eb',
};

export const LOGO_WIDTH_MIN = 16;
export const LOGO_WIDTH_MAX = 600;
export const LOGO_WIDTH_DEFAULT = 160;

/** An empty kit in the stored shape. */
export function emptyBrandKit(): BrandKit {
  return {
    company: {
      name: '',
      tagline: '',
      website: '',
      phone: '',
      email: '',
      address: '',
      logo_url: '',
      logo_width: LOGO_WIDTH_DEFAULT,
    },
    social: Object.fromEntries(BRAND_KIT_SOCIAL_NETWORKS.map((n) => [n, ''])) as Record<
      BrandKitSocialNetwork,
      string
    >,
    typography: { ...DEFAULT_BRAND_TYPOGRAPHY },
  };
}

/**
 * Fills any missing / malformed part of `raw` with defaults, so callers
 * can rely on the full shape even when talking to an older server.
 * (Values are not re-validated here — the server already did that.)
 */
export function normalizeBrandKit(raw: unknown): BrandKit {
  const base = emptyBrandKit();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<Record<keyof BrandKit, unknown>>;
  const pick = <T extends object>(defaults: T, value: unknown): T => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const v = (value as Record<keyof T, unknown>)[key];
      if (typeof v === typeof defaults[key]) out[key] = v as T[keyof T];
    }
    return out;
  };
  return {
    company: pick(base.company, input.company),
    social: pick(base.social, input.social),
    typography: pick(base.typography, input.typography),
  };
}

/** Whether `font` is one of {@link BRAND_KIT_FONTS}. */
export function isBrandKitFont(font: string): boolean {
  return BRAND_KIT_FONTS.some((f) => f.value === font);
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rgb` / `#rrggbb` — the only colours the kit stores. */
export function isBrandKitColor(value: string): boolean {
  return HEX_COLOR.test(value);
}
