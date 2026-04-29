// HTML / attribute escaping helpers used by the MJML emitter.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value: string | number | undefined): string {
  if (value === undefined) return '';
  return escapeHtml(String(value));
}
