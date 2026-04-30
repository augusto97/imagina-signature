/**
 * Post-compile validation warnings (CLAUDE.md §9.6 / §20.2).
 *
 * Returns a list of human-readable warning strings — never throws.
 * Callers (Export modal) surface them next to the copy/download
 * buttons so the user knows why their signature might render
 * unexpectedly.
 */
export function validateEmailHtml(html: string): string[] {
  const warnings: string[] = [];

  // Gmail clips messages over 102 KB.
  const size = new Blob([html]).size;
  if (size > 102 * 1024) {
    warnings.push('HTML exceeds 102KB; Gmail will clip it.');
  }

  const imgs = html.match(/<img[^>]*>/gi) ?? [];
  imgs.forEach((img, i) => {
    if (!/\salt=["'][^"']*["']/i.test(img)) {
      warnings.push(`Image #${i + 1} is missing an alt attribute.`);
    }
    if (!/\swidth=["']?\d+/i.test(img) && !/width:\s*\d+/i.test(img)) {
      warnings.push(`Image #${i + 1} is missing an explicit width.`);
    }
  });

  const links = html.match(/<a[^>]*>/gi) ?? [];
  links.forEach((link, i) => {
    if (!/\shref=["'][^"']*["']/i.test(link)) {
      warnings.push(`Link #${i + 1} has no href.`);
    }
  });

  return warnings;
}
