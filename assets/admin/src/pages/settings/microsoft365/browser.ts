/** Clipboard / download helpers for the Microsoft 365 tab. */

/** Copies `text`; resolves false when the browser refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (insecure context, denied permission).
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Saves `text` as a file. `bom` prefixes a UTF-8 byte-order mark —
 * Windows PowerShell 5.1 needs it to read a .ps1 as UTF-8.
 */
export function downloadText(filename: string, text: string, mime: string, bom = false): void {
  const blob = new Blob([bom ? '\ufeff' : '', text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
