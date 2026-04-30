/**
 * Pass-through translation helper for the admin app.
 *
 * Mirrors the editor's `__()` shape so future pipeline plumbing can
 * replace the body without touching call sites.
 */
export function __(text: string, ...args: Array<string | number>): string {
  if (args.length === 0) return text;
  let i = 0;
  return text.replace(/%s/g, () => String(args[i++] ?? ''));
}
