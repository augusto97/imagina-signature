import type { SocialIconsBlock } from '@/core/schema/blocks';
import { isIconShape, isIconTone, type IconShape, type IconTone } from '@/core/compiler/assets';
import { num, parseColor } from '@/core/compiler/css';
import { hasIcon } from './iconSet';

/**
 * v1 → v2 normaliser for the Social icons block.
 *
 * v1 (≤ 1.1.0) stored `networks: [{ platform, url }]`, `icon_size`,
 * `gap` and a single `color` for letter circles. v2 stores `items:
 * [{ id, network, url }]`, `shape`, `tone`, `size`, `spacing` and
 * `align`. Stored rows are never rewritten here — the Renderer,
 * compile() and the properties panel all read through
 * {@link normalizeSocialIcons}, and the panel writes the v2 shape on
 * the first edit (see {@link toV2Patch}).
 */

export type SocialItem = NonNullable<SocialIconsBlock['items']>[number];
export type SocialAlign = NonNullable<SocialIconsBlock['align']>;

export interface NormalizedSocialIcons {
  items: SocialItem[];
  shape: IconShape;
  tone: IconTone;
  size: number;
  spacing: number;
  align: SocialAlign;
}

export const SOCIAL_DEFAULTS = {
  shape: 'circle' as IconShape,
  tone: 'brand' as IconTone,
  size: 24,
  spacing: 8,
  align: 'left' as SocialAlign,
};

export const SOCIAL_SIZE_RANGE = { min: 16, max: 40 } as const;
export const SOCIAL_SPACING_RANGE = { min: 0, max: 24 } as const;

/** v1 platform ids that were renamed. */
const PLATFORM_ALIASES: Record<string, string> = {
  twitter: 'x',
  'x-twitter': 'x',
  web: 'website',
  site: 'website',
  mail: 'email',
};

/** Maps any stored network / v1 platform id to an icon name we ship. */
export function normalizeNetwork(value: unknown): string {
  const key = String(value ?? '')
    .trim()
    .toLowerCase();
  const name = PLATFORM_ALIASES[key] ?? key;
  return hasIcon(name) ? name : 'website';
}

/**
 * Closest icon tone for a single v1 colour: `brand` for any colourful
 * value (#1d4ed8, #0d9488…), and dark / gray / light for neutrals —
 * including tinted grays such as #111827 or #374151.
 */
export function toneFromColor(color: unknown, fallback: IconTone = SOCIAL_DEFAULTS.tone): IconTone {
  const rgb = channels(parseColor(color));
  if (!rgb) return fallback;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min > 0.18) return 'brand';
  const lightness = (max + min) / 2;
  if (lightness < 0.3) return 'dark';
  if (lightness < 0.8) return 'gray';
  return 'light';
}

/** `#rgb[a]` / `#rrggbb[aa]` / `rgb[a]()` → channels in 0…1 (alpha ignored). */
function channels(color: string | null): [number, number, number] | null {
  if (!color) return null;
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})(?:[0-9a-f]{2}|[0-9a-f])?$/.exec(color);
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.replace(/./g, (ch) => ch + ch) : hex[1]!;
    return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ];
  }
  const fn = /^rgba?\(([\d.]+%?),([\d.]+%?),([\d.]+%?)/.exec(color);
  if (!fn) return null;
  return [fn[1]!, fn[2]!, fn[3]!].map((v) =>
    Math.min(1, v.endsWith('%') ? Number.parseFloat(v) / 100 : Number.parseFloat(v) / 255),
  ) as [number, number, number];
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(num(value, min, max, fallback));
}

/** Resolved v2 view of a stored block (v1 or v2), with defaults and clamps applied. */
export function normalizeSocialIcons(block: SocialIconsBlock): NormalizedSocialIcons {
  const v2 = Array.isArray(block.items);
  const items: SocialItem[] = v2
    ? (block.items ?? [])
        .filter((item) => item && typeof item === 'object')
        .map((item, i) => ({
          id: typeof item.id === 'string' && item.id !== '' ? item.id : `${block.id}-${i}`,
          network: normalizeNetwork(item.network),
          url: typeof item.url === 'string' ? item.url : '',
        }))
    : (Array.isArray(block.networks) ? block.networks : [])
        .filter((n) => n && typeof n === 'object')
        .map((n, i) => ({
          id: `${block.id}-${i}`,
          network: normalizeNetwork(n.platform),
          url: typeof n.url === 'string' ? n.url : '',
        }));

  return {
    items,
    shape: isIconShape(block.shape) ? block.shape : SOCIAL_DEFAULTS.shape,
    tone: isIconTone(block.tone)
      ? block.tone
      : !v2 && block.color !== undefined
        ? toneFromColor(block.color)
        : SOCIAL_DEFAULTS.tone,
    size: clampInt(
      block.size ?? block.icon_size,
      SOCIAL_SIZE_RANGE.min,
      SOCIAL_SIZE_RANGE.max,
      SOCIAL_DEFAULTS.size,
    ),
    spacing: clampInt(
      block.spacing ?? block.gap,
      SOCIAL_SPACING_RANGE.min,
      SOCIAL_SPACING_RANGE.max,
      SOCIAL_DEFAULTS.spacing,
    ),
    align: block.align === 'center' || block.align === 'right' ? block.align : 'left',
  };
}

/**
 * The update that stores `next` as v2 and drops every v1 key. The
 * panel always sends a full v2 snapshot so a v1 block is converted
 * by its first edit.
 */
export function toV2Patch(next: NormalizedSocialIcons): Partial<SocialIconsBlock> {
  return {
    items: next.items,
    shape: next.shape,
    tone: next.tone,
    size: next.size,
    spacing: next.spacing,
    align: next.align,
    networks: undefined,
    icon_size: undefined,
    gap: undefined,
    color: undefined,
  };
}

const PLACEHOLDER_URL = /^(?:https?:)?\/*$/i;
/** A URL scheme (`https:`, `mailto:`…). No dots, so `example.com:8080` is not one. */
const HAS_SCHEME = /^[a-z][a-z0-9+-]*:/i;

/**
 * The link an item points to. Bare addresses are completed per
 * network: an email address gets `mailto:`, a WhatsApp number becomes
 * a wa.me link, and a domain without a scheme gets `https://`.
 * Returns '' when there is nothing to link to (empty or just
 * "https://"). Unsafe schemes are left for the compiler's URL pass,
 * which replaces them with `#` and reports an error.
 */
export function socialHref(network: string, url: string): string {
  const raw = String(url ?? '').trim();
  if (raw === '' || PLACEHOLDER_URL.test(raw)) return '';
  if (/\{\{[^}]*\}\}/.test(raw) && !HAS_SCHEME.test(raw)) {
    // A bare variable ({{linkedin_url}}) — its value carries the scheme.
    return raw;
  }
  if (network === 'email' && !/^mailto:/i.test(raw) && /^[^\s/:@]+@[^\s/:@]+$/.test(raw)) {
    return `mailto:${raw}`;
  }
  if (network === 'whatsapp' && /^\+?[\d\s().-]{5,}$/.test(raw)) {
    return `https://wa.me/${raw.replace(/\D/g, '')}`;
  }
  if (HAS_SCHEME.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `https://${raw.replace(/^\/+/, '')}`;
}
