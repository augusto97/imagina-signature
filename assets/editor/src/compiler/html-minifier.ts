// Minimalist whitespace minifier — preserves Outlook MSO conditional
// comments, since stripping them would break Outlook rendering.

export function minifyHtml(html: string): string {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}
