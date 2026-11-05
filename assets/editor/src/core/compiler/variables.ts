import { getConfig } from '@/bridge/apiClient';

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
 * The map every substitution uses: system variables overlaid with the
 * signature's own. User-defined variables win on key conflict so the
 * user can override any auto-merged value.
 */
export function resolvedVariables(
  userDefined: Record<string, string>,
  system: Record<string, string> = systemVariables(),
): Record<string, string> {
  return { ...system, ...userDefined };
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
