import type { ContactRowBlock } from '@/core/schema/blocks';
import type { FontWeight, TextAlign } from '@/core/schema/styles';
import { isIconShape, isIconTone, type IconShape, type IconTone } from '@/core/compiler/assets';
import { num } from '@/core/compiler/css';
import { __ } from '@/i18n/helpers';
import { toneFromColor } from '../social-icons/normalize';

/**
 * v1 → v2 normaliser and link builder for the Contact block.
 *
 * v1 (≤ 1.1.0) stored `rows: [{ icon: 'email'|'phone'|'web', label,
 * href }]` where `label` was the visible text. v2 stores typed `items`
 * whose link is derived from the value. Stored rows are never rewritten
 * here: the Renderer, compile() and the panel read through
 * {@link normalizeContactRow}, and the panel stores v2 on the first
 * edit ({@link toV2Patch}).
 */

export type ContactItem = NonNullable<ContactRowBlock['items']>[number];
export type ContactType = ContactItem['type'];
export type ContactLayout = NonNullable<ContactRowBlock['layout']>;
export type LabelMode = NonNullable<ContactRowBlock['label_mode']>;
export type ContactStyle = ContactRowBlock['style'];

export const CONTACT_TYPES: readonly ContactType[] = [
  'email',
  'phone',
  'mobile',
  'website',
  'address',
  'whatsapp',
  'calendar',
  'custom',
];

/** Icon (from `assets/icons/`) shown for each item type. */
export const CONTACT_ICON: Record<ContactType, string> = {
  email: 'email',
  phone: 'phone',
  mobile: 'mobile',
  website: 'website',
  address: 'address',
  whatsapp: 'whatsapp',
  calendar: 'calendar',
  custom: 'link',
};

export const SEPARATOR_PRESETS: readonly string[] = [' | ', ' · ', ' / '];

export const CONTACT_ICON_SIZE_RANGE = { min: 12, max: 32 } as const;
export const CONTACT_ROW_GAP_RANGE = { min: 0, max: 24 } as const;

export interface NormalizedContactRow {
  items: ContactItem[];
  layout: ContactLayout;
  separator: string;
  show_icons: boolean;
  icon_shape: IconShape;
  icon_tone: IconTone;
  icon_size: number;
  label_mode: LabelMode;
  /** `undefined` = same as the text colour. */
  link_color: string | undefined;
  row_gap: number;
  style: ContactStyle;
}

const V1_TYPE: Record<string, ContactType> = { email: 'email', phone: 'phone', web: 'website' };

function isContactType(value: unknown): value is ContactType {
  return typeof value === 'string' && (CONTACT_TYPES as readonly string[]).includes(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(num(value, min, max, fallback));
}

function normalizeStyle(style: Partial<ContactStyle> | undefined): ContactStyle {
  const s = style ?? {};
  const weight = Number(s.font_weight);
  const align: TextAlign =
    s.text_align === 'center' || s.text_align === 'right' ? s.text_align : 'left';
  const out: ContactStyle = {
    font_size: clampInt(s.font_size, 8, 32, 13),
    font_weight: ([400, 500, 600, 700].includes(weight) ? weight : 400) as FontWeight,
    color: typeof s.color === 'string' && s.color !== '' ? s.color : '#374151',
    text_align: align,
  };
  if (typeof s.font_family === 'string' && s.font_family.trim() !== '') {
    out.font_family = s.font_family;
  }
  if (s.line_height !== undefined) out.line_height = s.line_height;
  return out;
}

/** Resolved v2 view of a stored block (v1 or v2), with defaults and clamps applied. */
export function normalizeContactRow(block: ContactRowBlock): NormalizedContactRow {
  const style = normalizeStyle(block.style);

  if (!Array.isArray(block.items)) {
    // v1: every row rendered its glyph in the text colour, with the
    // block padding repeated on each row.
    const rows = Array.isArray(block.rows) ? block.rows : [];
    const pad = block.padding;
    return {
      items: rows
        .filter((row) => row && typeof row === 'object')
        .map((row, i) => {
          const type = V1_TYPE[row.icon] ?? 'custom';
          const value = str(row.label);
          const item: ContactItem = { id: `${block.id}-${i}`, type, value };
          const href = str(row.href).trim();
          if (href !== '' && href !== contactHref(item)) item.href = href;
          return item;
        }),
      layout: 'stacked',
      separator: SEPARATOR_PRESETS[0]!,
      show_icons: true,
      icon_shape: 'plain',
      icon_tone: toneFromColor(style.color, 'dark'),
      icon_size: clampInt(
        style.font_size * 1.15,
        CONTACT_ICON_SIZE_RANGE.min,
        CONTACT_ICON_SIZE_RANGE.max,
        16,
      ),
      label_mode: 'none',
      link_color: undefined,
      row_gap: pad ? clampInt(pad.top + pad.bottom, 0, 24, 4) : 0,
      style,
    };
  }

  return {
    items: block.items
      .filter((item) => item && typeof item === 'object')
      .map((item, i) => {
        const out: ContactItem = {
          id: typeof item.id === 'string' && item.id !== '' ? item.id : `${block.id}-${i}`,
          type: isContactType(item.type) ? item.type : 'custom',
          value: str(item.value),
        };
        if (typeof item.label === 'string') out.label = item.label;
        if (typeof item.href === 'string' && item.href.trim() !== '') out.href = item.href;
        return out;
      }),
    layout: block.layout === 'inline' ? 'inline' : 'stacked',
    separator: typeof block.separator === 'string' ? block.separator : SEPARATOR_PRESETS[0]!,
    show_icons: block.show_icons !== false,
    icon_shape: isIconShape(block.icon_shape) ? block.icon_shape : 'circle',
    icon_tone: isIconTone(block.icon_tone) ? block.icon_tone : 'brand',
    icon_size: clampInt(
      block.icon_size,
      CONTACT_ICON_SIZE_RANGE.min,
      CONTACT_ICON_SIZE_RANGE.max,
      16,
    ),
    label_mode:
      block.label_mode === 'short' || block.label_mode === 'custom' ? block.label_mode : 'none',
    link_color:
      typeof block.link_color === 'string' && block.link_color !== ''
        ? block.link_color
        : undefined,
    row_gap: clampInt(block.row_gap, CONTACT_ROW_GAP_RANGE.min, CONTACT_ROW_GAP_RANGE.max, 4),
    style,
  };
}

/** The update that stores `next` as v2 and drops the v1 `rows`. */
export function toV2Patch(next: NormalizedContactRow): Partial<ContactRowBlock> {
  return {
    items: next.items,
    layout: next.layout,
    separator: next.separator,
    show_icons: next.show_icons,
    icon_shape: next.icon_shape,
    icon_tone: next.icon_tone,
    icon_size: next.icon_size,
    label_mode: next.label_mode,
    link_color: next.link_color,
    row_gap: next.row_gap,
    style: next.style,
    rows: undefined,
  };
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const TOKEN = /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g;
const ALLOWED_WEB_SCHEME = /^(?:https?|mailto|tel):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+-]*:/i;

/**
 * Splits `value` into literal text and `{{variable}}` tokens. Known
 * variables are resolved to their raw value (the compiler escapes the
 * final href); unknown ones stay as tokens for the pipeline's
 * substitution pass, which reports them.
 */
function segments(
  value: string,
  variables: Record<string, string>,
): Array<{ text: string; token: boolean }> {
  const out: Array<{ text: string; token: boolean }> = [];
  let last = 0;
  for (const m of value.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: value.slice(last, start), token: false });
    const name = m[0].replace(/[{}\s]/g, '');
    if (Object.prototype.hasOwnProperty.call(variables, name)) {
      out.push({ text: variables[name] ?? '', token: false });
    } else {
      out.push({ text: m[0], token: true });
    }
    last = start + m[0].length;
  }
  if (last < value.length) out.push({ text: value.slice(last), token: false });
  return out;
}

/** Applies `fn` to the literal parts only, keeping unresolved tokens intact. */
function mapLiterals(
  value: string,
  variables: Record<string, string>,
  fn: (literal: string) => string,
): string {
  return segments(value, variables)
    .map((s) => (s.token ? s.text : fn(s.text)))
    .join('');
}

function phoneDigits(value: string, variables: Record<string, string>, keepPlus: boolean): string {
  const raw = mapLiterals(value, variables, (t) => t.replace(/[^\d+]/g, ''));
  const plus = keepPlus && raw.startsWith('+') ? '+' : '';
  return plus + raw.replace(/\+/g, '');
}

/** `https://` added to bare domains; non-web schemes (`javascript:`…) give ''. */
export function webHref(value: string): string {
  const v = value.trim();
  if (v === '' || /^(?:https?:)?\/*$/i.test(v)) return '';
  if (HAS_SCHEME.test(v)) return ALLOWED_WEB_SCHEME.test(v) ? v : '';
  if (v.startsWith('//')) return `https:${v}`;
  return `https://${v.replace(/^\/+/, '')}`;
}

/**
 * The link of one item: its explicit `href` when set, otherwise one
 * derived from the value — `mailto:` for email, `tel:` + digits for
 * phone / mobile, `https://wa.me/<digits>` for WhatsApp, `https://`
 * for website / calendar booking links, a Google Maps search for an
 * address. Returns '' when the item should not be linked.
 */
export function contactHref(item: ContactItem, variables: Record<string, string> = {}): string {
  const explicit = str(item.href).trim();
  if (explicit !== '') return explicit;
  const value = str(item.value).trim();
  if (value === '') return '';

  switch (item.type) {
    case 'email': {
      const address = mapLiterals(value, variables, (t) => t.replace(/\s+/g, '')).replace(
        /^mailto:/i,
        '',
      );
      return address === '' ? '' : `mailto:${address}`;
    }
    case 'phone':
    case 'mobile': {
      if (/^tel:/i.test(value)) return value.replace(/\s+/g, '');
      const digits = phoneDigits(value, variables, true);
      return /\d|\{\{/.test(digits) ? `tel:${digits}` : '';
    }
    case 'whatsapp': {
      if (/^https?:\/\//i.test(value)) return value;
      const digits = phoneDigits(value, variables, false);
      return /\d|\{\{/.test(digits) ? `https://wa.me/${digits}` : '';
    }
    case 'website':
    case 'calendar': {
      const resolved = segments(value, variables)
        .map((s) => s.text)
        .join('');
      return /^\{\{[^}]*\}\}$/.test(resolved) ? resolved : webHref(resolved);
    }
    case 'address': {
      const query = mapLiterals(value, variables, (t) => encodeURIComponent(t));
      return `https://www.google.com/maps/search/?api=1&query=${query}`;
    }
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Short prefix per type ("E:", "T:"…), translated at call time. */
export function shortLabel(type: ContactType): string {
  switch (type) {
    case 'email':
      return __('E:');
    case 'phone':
      return __('T:');
    case 'mobile':
      return __('M:');
    case 'website':
      return __('W:');
    case 'address':
      return __('A:');
    case 'whatsapp':
      return __('WA:');
    case 'calendar':
      return __('Book:');
    default:
      return '';
  }
}

/** Translated name of an item type (panel picker). */
export function typeLabel(type: ContactType): string {
  switch (type) {
    case 'email':
      return __('Email');
    case 'phone':
      return __('Phone');
    case 'mobile':
      return __('Mobile');
    case 'website':
      return __('Website');
    case 'address':
      return __('Address');
    case 'whatsapp':
      return __('WhatsApp');
    case 'calendar':
      return __('Booking link');
    default:
      return __('Custom');
  }
}

/** The prefix shown before an item's value for the given label mode ('' for none). */
export function itemPrefix(item: ContactItem, mode: LabelMode): string {
  if (mode === 'short') return shortLabel(item.type);
  if (mode === 'custom') return str(item.label).trim();
  return '';
}
