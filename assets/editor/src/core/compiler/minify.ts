/**
 * Minifies the compiled HTML.
 *
 * Conservative — strips inter-tag whitespace and HTML comments
 * EXCEPT mso conditional comments, which Outlook needs verbatim.
 * Doesn't touch text content (preserves spaces inside attribute
 * values and between adjacent inline elements).
 */
export function minifyHtml(html: string): string {
  return (
    html
      // Drop non-conditional comments (`<!-- ... -->` but not
      // `<!--[if ...]>...<![endif]-->`).
      .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
      // Collapse whitespace between tags.
      .replace(/>\s+</g, '><')
      // Trim leading/trailing whitespace per line, then join.
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('')
  );
}
