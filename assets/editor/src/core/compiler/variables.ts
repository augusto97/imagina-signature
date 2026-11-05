import { getConfig } from '@/bridge/apiClient';
import { PROFILE_KEYS } from '@shared/profileFields';

/**
 * Variable substitution.
 *
 * The schema's `variables: Record<string, string>` is the source of
 * values; the editor surfaces a small panel where the user can
 * manage them. Inside any string field — text content, alt, href,
 * label, button label — the user types `{{varname}}` and the
 * compiler swaps it for the variable's value at the very end of the
 * pipeline.
 *
 * Substitution is HTML-escaped: a value with `<` or `&` won't break
 * out of an attribute or inject markup. Trade-off: a variable can't
 * carry intentional HTML. That's fine for the email-signature use
 * case — variables are names, titles, phone numbers, URLs, not
 * formatted markup.
 *
 * Unknown variable names are left alone (`{{missing}}` ships as
 * literal `{{missing}}` instead of disappearing) so a typo doesn't
 * silently delete content. Missing variables are also reported as
 * compile warnings via the second return value.
 *
 * The canvas "Show data" mode (`editor/canvas/liveData.ts`) runs the
 * same {@link replaceVariables} over each block's string fields, with
 * the same {@link resolvedVariables} map, so what the canvas shows is
 * what the export substitutes.
 */

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * Replaces every `{{name}}` token in `text` whose name is defined in
 * `variables` with `encode(value)`; unknown names stay as written and
 * are reported in `missing`. The single implementation of the token
 * syntax — everything that resolves variables goes through here.
 */
export function replaceVariables(
  text: string,
  variables: Record<string, string>,
  encode: (value: string) => string = (value) => value,
): { text: string; missing: string[] } {
  const missing = new Set<string>();

  const next = text.replace(VARIABLE_REGEX, (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      missing.add(name);
      return match;
    }
    return encode(variables[name] ?? '');
  });

  return { text: next, missing: Array.from(missing) };
}

/** Compiler entry point: substitution with HTML-escaped values. */
export function substituteVariables(
  html: string,
  variables: Record<string, string>,
): { html: string; missing: string[] } {
  const { text, missing } = replaceVariables(html, variables, escapeHtml);
  return { html: text, missing };
}

/** Names of the `{{name}}` tokens in `text`, in order of first appearance. */
export function variableTokenNames(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(new RegExp(VARIABLE_REGEX.source, 'g'))) {
    if (match[1]) names.add(match[1]);
  }
  return Array.from(names);
}

/** Whether `text` contains at least one `{{name}}` token. */
export function hasVariableTokens(text: string): boolean {
  // Fresh non-global copy: a shared /g regex keeps `lastIndex` state.
  return new RegExp(VARIABLE_REGEX.source).test(text);
}

/**
 * The read-only system variables from the bootstrap
 * (`IMGSIG_EDITOR_CONFIG.systemVariables`: `wp_*` user fields and
 * `company_*` brand-kit fields). Empty outside the editor host.
 */
export function systemVariables(): Record<string, string> {
  try {
    return getConfig().systemVariables ?? {};
  } catch {
    // Bootstrap config unavailable (test / standalone). System vars
    // simply contribute nothing — user-defined variables work as before.
    return {};
  }
}

/**
 * Keys whose system value comes from the user's profile: the canonical
 * {@link PROFILE_KEYS} plus the admin's custom profile fields
 * (`IMGSIG_EDITOR_CONFIG.profileFields`).
 */
export function profileVariableKeys(): string[] {
  const keys: string[] = [...PROFILE_KEYS];
  try {
    for (const field of getConfig().profileFields ?? []) {
      if (field && typeof field.key === 'string' && !keys.includes(field.key)) keys.push(field.key);
    }
  } catch {
    // No bootstrap (tests / standalone): canonical keys only.
  }
  return keys;
}

/**
 * The map every substitution uses: system variables overlaid with the
 * signature's own.
 *
 *  - Profile keys ({@link profileVariableKeys}): a NON-EMPTY profile
 *    value wins — templates ship example values (`job_title: 'Directora
 *    comercial'`) that must give way to the employee's real data — and
 *    the signature's value is only the fallback for an empty profile.
 *  - Every other key: the signature's own variable wins, so the user
 *    can override any auto-merged value (`wp_*`, `company_*`).
 *
 * A signature variable's VALUE may itself reference system variables
 * — a template ships `photo_url: "{{imgsig_assets_url}}/templates/avatar-1.png"`
 * so its placeholder photo works on every site. Those references are
 * expanded here, one level deep and against the system variables only
 * (never other signature variables), so there are no chains or cycles.
 * Unknown tokens stay as written and are reported by the compiler.
 */
export function resolvedVariables(
  userDefined: Record<string, string>,
  system: Record<string, string> = systemVariables(),
  profileKeys: readonly string[] = profileVariableKeys(),
): Record<string, string> {
  const merged: Record<string, string> = { ...system };
  for (const [key, value] of Object.entries(userDefined)) {
    merged[key] =
      typeof value === 'string' && hasVariableTokens(value)
        ? replaceVariables(value, system).text
        : value;
  }
  for (const key of profileKeys) {
    const value = system[key];
    if (typeof value === 'string' && value !== '') merged[key] = value;
  }
  return merged;
}

/** Prefix of plugin-internal system variables (`imgsig_assets_url`). */
const INTERNAL_PREFIX = 'imgsig_';

/**
 * Plugin-internal system variables — present so shipped templates can
 * reference their placeholder images, but not something a user would
 * insert by hand, so field pickers hide them.
 */
export function isInternalVariable(key: string): boolean {
  return key.startsWith(INTERNAL_PREFIX);
}

/**
 * Whether the signature's own variable `key` is shadowed by a non-empty
 * profile value (so editing it has no effect on the output).
 */
export function isShadowedByProfile(
  key: string,
  system: Record<string, string> = systemVariables(),
  profileKeys: readonly string[] = profileVariableKeys(),
): boolean {
  return profileKeys.includes(key) && typeof system[key] === 'string' && system[key] !== '';
}

/** HTML text / attribute escaper applied to substituted values. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
