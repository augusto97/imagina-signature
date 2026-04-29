// Dark-mode preview applies CSS variables documented by Apple Mail / Gmail
// to highlight images and link colors that disappear when the client
// inverts the user's color scheme.

export function applyDarkOverlay(html: string): string {
  // Inject a minimal `prefers-color-scheme: dark` style block.
  const overlay = `<style>@media (prefers-color-scheme: dark) {
    body { background: #111827 !important; color: #f3f4f6 !important; }
    img { filter: brightness(0.95) contrast(1.05); }
    a { color: #93c5fd !important; }
  }</style>`;
  return html.replace(/<head>/i, `<head>${overlay}`);
}
