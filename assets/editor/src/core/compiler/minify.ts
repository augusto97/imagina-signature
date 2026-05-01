/**
 * Minifies the compiled HTML.
 *
 * Strips inter-tag whitespace and HTML comments — but very carefully,
 * because Outlook conditional comments must survive verbatim or the
 * VML buttons / Outlook fixes break.
 *
 * Two conditional-comment forms are in play:
 *
 *  1. **Downlevel-hidden** (most common):
 *       <!--[if mso]>…content only Outlook sees…<![endif]-->
 *     Other browsers parse this as a single HTML comment, content
 *     is hidden everywhere except Outlook.
 *
 *  2. **Downlevel-revealed** (used by the Button block + the GIF
 *     fallback in 1.0.16):
 *       <!--[if !mso]><!--><a …>…</a><!--<![endif]-->
 *     The opener `<!--[if !mso]><!-->` ends a comment in non-Outlook
 *     so the `<a>` shows; the closer `<!--<![endif]-->` re-opens a
 *     comment in non-Outlook just to close the Outlook conditional.
 *     If we strip the closer the opener has no `-->` to terminate
 *     and the comment swallows everything that follows.
 *
 * Strategy: extract every conditional block (matched from the
 * `<!--[if…]>` opener to the matching `<![endif]-->` closer)
 * into a placeholder before stripping plain comments, then put
 * them back. Both forms have the same opener prefix `<!--[if` and
 * end with `<![endif]-->`, so a single regex captures both.
 *
 * Doesn't touch text content (preserves spaces inside attribute
 * values and between adjacent inline elements).
 */
const PLACEHOLDER_PREFIX = 'IMGSIG_COND_';
const PLACEHOLDER_SUFFIX = '';

export function minifyHtml(html: string): string {
  // 1. Pull conditional comments out and stash them in placeholders.
  //    The capture is greedy enough to span the full opener-content-closer
  //    pattern but non-greedy to avoid swallowing across two siblings.
  const conditionals: string[] = [];
  const stashed = html.replace(
    /<!--\[if[\s\S]*?<!\[endif\]-->/g,
    (match) => {
      const idx = conditionals.length;
      conditionals.push(match);
      return `${PLACEHOLDER_PREFIX}${idx}${PLACEHOLDER_SUFFIX}`;
    },
  );

  // 2. Strip every other comment (`<!-- … -->`) and collapse whitespace.
  const minified = stashed
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('');

  // 3. Restore conditionals exactly as they were.
  return minified.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g'),
    (_, idx: string) => conditionals[Number.parseInt(idx, 10)] ?? '',
  );
}
