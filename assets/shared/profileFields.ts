/**
 * Employee profile fields — shared by the admin app ("My profile",
 * Settings → Profile fields, CSV import) and the editor (system
 * variables precedence, Variables panel).
 *
 * Mirrors `src/Directory/ProfileFields.php`, which is authoritative:
 * it sanitises every write and resolves the admin's source mapping.
 */

// i18n-ignore-file — only identifiers here; labels come from the server.

/**
 * Canonical profile keys, in display order. They are also the
 * signature-variable keys the shipped templates use (with example
 * values), which is why a non-empty profile value wins over the
 * signature's own variable — see `resolvedVariables()`.
 */
export const PROFILE_KEYS = [
  'job_title',
  'department',
  'phone',
  'mobile',
  'photo_url',
  'linkedin_url',
  'calendar_url',
  'website_url',
  'address_line',
  'pronouns',
] as const;

export type ProfileKey = (typeof PROFILE_KEYS)[number];

export type ProfileFieldType = 'text' | 'phone' | 'url' | 'email';

export const PROFILE_FIELD_TYPES: readonly ProfileFieldType[] = ['text', 'phone', 'url', 'email'];

/** Most admin-defined custom fields. */
export const MAX_CUSTOM_PROFILE_FIELDS = 10;

/** A field as the editor bootstrap describes it (`profileFields`). */
export interface ProfileFieldDefinition {
  key: string;
  label: string;
  type: ProfileFieldType;
  /** Admin-defined (not one of {@link PROFILE_KEYS}). */
  custom: boolean;
  /** Read from another user meta key: not editable in the plugin. */
  readonly: boolean;
}

/** A field as the admin REST endpoints describe it. */
export interface ProfileFieldAdminDefinition extends Omit<ProfileFieldDefinition, 'readonly'> {
  source: 'plugin' | 'meta';
  /** User meta key (or user_url / user_email / display_name) when `source` is `meta`. */
  meta_key: string;
  readonly?: boolean;
}

/** `imgsig_profile_fields` as GET/PUT /admin/profile-fields exchange it. */
export interface ProfileFieldsConfig {
  mapping: Record<string, { source: 'plugin' | 'meta'; meta_key: string }>;
  custom: Array<{ key: string; label: string; type: ProfileFieldType }>;
}

const CANONICAL = new Set<string>(PROFILE_KEYS);

/** Whether `key` is one of the canonical profile keys. */
export function isProfileKey(key: string): key is ProfileKey {
  return CANONICAL.has(key);
}

/** Same rule as the server: `[a-z][a-z0-9_]{0,39}`, not canonical, not `wp_*` / `company_*`. */
export function isValidCustomFieldKey(key: string): boolean {
  return (
    /^[a-z][a-z0-9_]{0,39}$/.test(key) &&
    !CANONICAL.has(key) &&
    !key.startsWith('wp_') &&
    !key.startsWith('company_')
  );
}
