/**
 * Clipboard helpers for the export flow.
 *
 * The editor offers three "copy" modes that look similar but write
 * different MIME types:
 *
 *  - `copyText(html)`        — plain text, the literal HTML source.
 *                               Used when the user wants to paste
 *                               into an HTML-mode signature box
 *                               (Gmail's "<>" view, raw `.html`
 *                               edit, etc.).
 *  - `copyRichHtml(html)`    — `text/html` MIME type so receiving
 *                               apps render it visually. Used for
 *                               webmails / composers that only
 *                               accept rich text and refuse a raw
 *                               HTML paste.
 *
 * Both fall back gracefully when the modern Clipboard API isn't
 * available (old Safari, restricted iframe contexts).
 */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied / not granted — fall through to legacy.
  }
  return legacyTextCopy(text);
}

/**
 * Writes both `text/html` (so contenteditable / rich-text composers
 * render the signature visually on paste) and `text/plain` (so
 * pasting into a plain-text field still leaves a readable trace).
 *
 * Modern path uses `ClipboardItem`; falls back to a hidden
 * contenteditable + `document.execCommand('copy')` when
 * `ClipboardItem` is unavailable. The fallback writes both MIME
 * types because the OS clipboard captures whatever's selected,
 * and a contenteditable selection naturally carries both.
 */
export async function copyRichHtml(html: string): Promise<boolean> {
  // Modern path.
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([htmlToPlainText(html)], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ]);
      return true;
    }
  } catch {
    // Some browsers (older Firefox builds, locked-down iframe
    // contexts) advertise ClipboardItem but throw — fall through.
  }

  // Legacy path: render to an offscreen contenteditable, select it,
  // and `execCommand('copy')`. The OS captures the rich selection
  // exactly as if the user had selected text in a webmail compose
  // window — so paste produces the same rich content.
  return legacyRichCopy(html);
}

function legacyTextCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function legacyRichCopy(html: string): boolean {
  try {
    const container = document.createElement('div');
    container.contentEditable = 'true';
    container.innerHTML = html;
    container.style.position = 'fixed';
    container.style.top = '-10000px';
    container.style.left = '0';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);

    const selection = window.getSelection();
    if (!selection) {
      document.body.removeChild(container);
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);

    const ok = document.execCommand('copy');

    selection.removeAllRanges();
    document.body.removeChild(container);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Best-effort plain-text fallback derived from the HTML — used as
 * the `text/plain` arm of the rich copy so a recipient who pastes
 * into a plain-text field gets readable content, not the raw markup.
 *
 * Strips tags, collapses whitespace, decodes the handful of named
 * entities the compiler emits.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|td|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
