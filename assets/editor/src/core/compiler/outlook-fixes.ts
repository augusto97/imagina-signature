/**
 * Outlook desktop quirks workarounds (CLAUDE.md §9.5).
 *
 * Sprint 9 ships:
 *  - `mso-line-height-rule:exactly` rule injection so Outlook
 *    honours line-height attributes instead of adding extra leading.
 *
 * Sprint 11 polish phase will add:
 *  - VML "bullet-proof button" wrapper for `button_cta` blocks so
 *    Outlook 2007–2019 render rounded buttons; rest of clients keep
 *    using the CSS path.
 *  - VML overlay for round avatars (border-radius isn't honoured).
 *
 * Returning the input unchanged when the document doesn't need a
 * fix keeps the function safe to apply unconditionally.
 */
export function applyOutlookFixes(html: string): string {
  // Force exact line-height on cells that declare one.
  let out = html.replace(
    /<td([^>]*)style="([^"]*?line-height:[^";]+)([^"]*)"/g,
    (_match, before, lineHeightChunk, after) => {
      if (lineHeightChunk.includes('mso-line-height-rule')) return _match;
      return `<td${before}style="${lineHeightChunk};mso-line-height-rule:exactly${after}"`;
    },
  );

  // Inject Outlook-specific CSS reset just inside <body>. Doing this
  // in <head> would require mutating the shell wrapper; injecting via
  // a conditional `<!--[if mso]>` block keeps non-Outlook clients
  // untouched.
  const msoReset = `<!--[if mso]>
<style type="text/css">
table { border-collapse: collapse; }
td, th { mso-line-height-rule: exactly; }
img { -ms-interpolation-mode: bicubic; }
</style>
<![endif]-->`;

  out = out.replace('<body', `${msoReset}<body`);

  return out;
}
