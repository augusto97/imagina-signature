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
 */

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function substituteVariables(
  html: string,
  variables: Record<string, string>,
): { html: string; missing: string[] } {
  const missing = new Set<string>();

  const next = html.replace(VARIABLE_REGEX, (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      missing.add(name);
      return match;
    }
    return escapeHtml(variables[name] ?? '');
  });

  return { html: next, missing: Array.from(missing) };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
