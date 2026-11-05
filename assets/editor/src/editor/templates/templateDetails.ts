import type { AvatarBlock, Block } from '@/core/schema/blocks';
import type { SignatureSchema } from '@/core/schema/signature';
import { walkBlocks } from '@/core/schema/tree';
import { isInternalVariable, profileVariableKeys } from '@/core/compiler/variables';
import { __ } from '@/i18n/helpers';

/**
 * The "Your details" form: which fields a template (or the signature
 * being edited) needs, how each is labelled, and where its value comes
 * from.
 *
 *  - `profile` — `wp_*` system variables, from the user's WordPress
 *    profile, and the employee profile fields (job_title, phone… and
 *    the admin's custom fields) when the bootstrap provides them;
 *  - `company` — `company_*` system variables, from the brand kit;
 *  - `signature` — the signature's own variables (the canonical keys
 *    job_title, department, phone… or anything an admin template adds).
 *
 * Profile / company fields with a value are read-only ("from your
 * profile"): a non-empty profile value is what ships, whatever the
 * signature says. When the value is blank the field is editable and the
 * entry is stored as a signature variable of the same name, which the
 * compiler uses in its place.
 */

export type DetailSource = 'profile' | 'company' | 'signature';
export type DetailInput = 'text' | 'email' | 'tel' | 'url' | 'photo';

export interface DetailField {
  key: string;
  label: string;
  source: DetailSource;
  input: DetailInput;
  /** Profile / brand-kit value, '' when blank (system fields only). */
  systemValue: string;
  /** True when the value comes from the profile / brand kit and can't be edited here. */
  readOnly: boolean;
}

/** Signature variables in form order. */
export const CANONICAL_KEYS = [
  'job_title',
  'department',
  'phone',
  'mobile',
  'linkedin_url',
  'calendar_url',
  'website_url',
  'address_line',
  'photo_url',
] as const;

const PROFILE_ORDER = ['wp_display_name', 'wp_email', 'wp_first_name', 'wp_last_name', 'wp_url'];
const COMPANY_ORDER = [
  'company_name',
  'company_tagline',
  'company_website',
  'company_phone',
  'company_email',
  'company_address',
  'company_logo',
  'company_linkedin',
  'company_x',
  'company_facebook',
  'company_instagram',
  'company_youtube',
  'company_tiktok',
  'company_github',
  'company_whatsapp',
];

/** Translated label of a variable key; unknown keys are humanised. */
export function detailLabel(key: string): string {
  switch (key) {
    case 'wp_display_name':
      return __('Full name');
    case 'wp_email':
      return __('Email');
    case 'wp_first_name':
      return __('First name');
    case 'wp_last_name':
      return __('Last name');
    case 'wp_url':
      return __('Personal website');
    case 'job_title':
      return __('Job title');
    case 'department':
      return __('Department');
    case 'phone':
      return __('Phone');
    case 'mobile':
      return __('Mobile');
    case 'photo_url':
      return __('Photo');
    case 'linkedin_url':
      return __('LinkedIn profile');
    case 'calendar_url':
      return __('Booking link');
    case 'website_url':
      return __('Web page');
    case 'address_line':
      return __('Address');
    case 'company_name':
      return __('Company');
    case 'company_tagline':
      return __('Company tagline');
    case 'company_website':
      return __('Company website');
    case 'company_phone':
      return __('Company phone');
    case 'company_email':
      return __('Company email');
    case 'company_address':
      return __('Company address');
    case 'company_logo':
      return __('Company logo');
    case 'company_linkedin':
      return __('Company LinkedIn');
    case 'company_x':
      return __('Company X');
    case 'company_facebook':
      return __('Company Facebook');
    case 'company_instagram':
      return __('Company Instagram');
    case 'company_youtube':
      return __('Company YouTube');
    case 'company_tiktok':
      return __('Company TikTok');
    case 'company_github':
      return __('Company GitHub');
    case 'company_whatsapp':
      return __('Company WhatsApp');
    default: {
      const words = key.replace(/[_.-]+/g, ' ').trim();
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

/** Short, translated hint under a signature field (format help). */
export function detailPlaceholder(key: string): string {
  switch (key) {
    case 'phone':
    case 'mobile':
      return __('e.g. +34 600 000 000');
    case 'linkedin_url':
      return 'https://www.linkedin.com/in/…'; // i18n-ignore
    case 'calendar_url':
    case 'website_url':
      return 'https://…'; // i18n-ignore
    default:
      return '';
  }
}

function inputFor(key: string): DetailInput {
  if (key === 'photo_url') return 'photo';
  if (key.endsWith('email')) return 'email';
  if (key === 'phone' || key === 'mobile' || key.endsWith('_phone')) return 'tel';
  if (
    key.endsWith('_url') ||
    key.endsWith('_website') ||
    key === 'company_logo' ||
    /^company_(linkedin|x|facebook|instagram|youtube|tiktok|github|whatsapp)$/.test(key)
  ) {
    return 'url';
  }
  return 'text';
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Every `{{key}}` referenced anywhere in the blocks (any depth, any field). */
export function referencedVariables(blocks: Block[]): Set<string> {
  const found = new Set<string>();
  const scan = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const m of value.matchAll(TOKEN)) found.add(m[1]!);
    } else if (Array.isArray(value)) {
      value.forEach(scan);
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        // Children are walked by walkBlocks; skip them here.
        if (key !== 'children') scan(item);
      }
    }
  };
  walkBlocks(blocks, (block) => {
    scan(block);
  });
  return found;
}

function rank(order: readonly string[], key: string): number {
  const i = order.indexOf(key);
  return i === -1 ? order.length : i;
}

/**
 * The fields of the details form for `schema` (a template or the
 * signature being edited): every variable its blocks reference plus
 * the keys its own `variables` map declares, profile first, then the
 * signature's own fields, then company fields. Plugin-internal keys
 * (`imgsig_*`) are left out.
 */
export function detailFields(
  schema: Pick<SignatureSchema, 'blocks' | 'variables'>,
  system: Record<string, string>,
  profileKeys: readonly string[] = profileVariableKeys(),
): DetailField[] {
  const keys = referencedVariables(schema.blocks ?? []);
  for (const key of Object.keys(schema.variables ?? {})) keys.add(key);

  const profile: string[] = [];
  const company: string[] = [];
  const own: string[] = [];
  for (const key of keys) {
    if (isInternalVariable(key)) continue;
    if ((key.startsWith('wp_') || profileKeys.includes(key)) && key in system) profile.push(key);
    else if (key.startsWith('company_') && key in system) company.push(key);
    else own.push(key);
  }
  profile.sort(
    (a, b) =>
      rank(PROFILE_ORDER, a) - rank(PROFILE_ORDER, b) ||
      rank(CANONICAL_KEYS, a) - rank(CANONICAL_KEYS, b) ||
      a.localeCompare(b),
  );
  company.sort((a, b) => rank(COMPANY_ORDER, a) - rank(COMPANY_ORDER, b));
  own.sort((a, b) => rank(CANONICAL_KEYS, a) - rank(CANONICAL_KEYS, b) || a.localeCompare(b));

  const field = (key: string, source: DetailSource): DetailField => {
    const systemValue = source === 'signature' ? '' : (system[key] ?? '').trim();
    return {
      key,
      label: detailLabel(key),
      source,
      input: inputFor(key),
      systemValue,
      // A blank profile / brand-kit field can be filled in here.
      readOnly: source !== 'signature' && systemValue !== '',
    };
  };

  return [
    ...profile.map((k) => field(k, 'profile')),
    ...own.map((k) => field(k, 'signature')),
    ...company.map((k) => field(k, 'company')),
  ];
}

/**
 * The signature variables to store from the form: `base` (the
 * template's examples / the signature's current variables) with every
 * editable field applied. Signature fields are stored as typed; a
 * profile / brand-kit field only when filled in — a blank override
 * would hide the value the brand kit gets later.
 */
export function variablesFromForm(
  fields: readonly DetailField[],
  values: Record<string, string>,
  base: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const field of fields) {
    if (field.readOnly) continue;
    const value = values[field.key] ?? '';
    if (field.source === 'signature') out[field.key] = value;
    else if (value.trim() !== '') out[field.key] = value.trim();
    else delete out[field.key];
  }
  return out;
}

/**
 * The avatar showing `{{photo_url}}`, if any — its shape and size tell
 * the photo upload how to crop and mask.
 */
export function photoAvatar(blocks: Block[]): AvatarBlock | null {
  let found: AvatarBlock | null = null;
  walkBlocks(blocks, (block) => {
    if (
      !found &&
      block.type === 'avatar' &&
      /\{\{\s*photo_url\s*\}\}/.test((block as AvatarBlock).src)
    ) {
      found = block as AvatarBlock;
    }
    return found === null;
  });
  return found;
}

/** True for the shipped placeholder images (`{{imgsig_assets_url}}/templates/…`). */
export function isPlaceholderImage(value: string): boolean {
  return /^\{\{\s*imgsig_assets_url\s*\}\}\/templates\//.test(value.trim());
}
