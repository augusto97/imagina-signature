import { escapeHtml } from '@/core/compiler/css';
import { htmlToPlainText } from '@/core/compiler/plain-text';

/**
 * Rich-text helpers for blocks that started life as plain text
 * (heading, disclaimer).
 *
 * Storage model (1.2):
 *  - `content_html` holds the Tiptap HTML. The `_html` suffix routes it
 *    through the server's rich-text kses on save (SchemaSanitizer).
 *  - `content` keeps a plain-text mirror (written together with
 *    `content_html`), so plain-text export, the Layers panel, the
 *    server's plain-text handling and pre-1.2 readers all keep working.
 *
 * Migration is implicit and lossless: a row without `content_html` —
 * or whose `content` was changed by something that didn't update
 * `content_html` (an older editor, a template, a profile-field sync) —
 * renders its plain `content`, HTML-escaped, with newlines as `<br>`.
 */

export interface RichContentFields {
  content: string;
  content_html?: string;
}

/** Plain text → escaped HTML, line breaks preserved as `<br>`. */
export function plainTextToHtml(text: string): string {
  return escapeHtml(String(text ?? '')).replace(/\r?\n/g, '<br>');
}

/** The plain-text mirror stored in `content` for a rich value. */
export function richTextToPlain(html: string): string {
  return htmlToPlainText(html ?? '');
}

/**
 * The HTML a heading / disclaimer renders: `content_html` while it
 * still describes the same text as `content`, otherwise the escaped
 * plain `content` (see module docs).
 */
export function resolveRichContent(block: RichContentFields): string {
  const html = block.content_html;
  const plain = String(block.content ?? '');
  if (typeof html === 'string' && html.trim() !== '') {
    if (comparable(richTextToPlain(html)) === comparable(plain)) return html;
  }
  return plainTextToHtml(plain);
}

/** Store patch for an edit made in the rich-text editor. */
export function richContentPatch(html: string): RichContentFields {
  return { content_html: html, content: richTextToPlain(html) };
}

/**
 * Adds a px `line-height` to every sanitised `<span>` that changes the
 * font size, scaled by the block's line-height multiplier. The block
 * cell carries a px line height (Outlook needs it), which a larger
 * inline span would otherwise inherit and overflow.
 *
 * Expects SANITISER output (`style="prop:value;…"`, no spaces).
 */
export function scaleSpanLineHeights(html: string, lineHeight: number): string {
  if (!html.includes('font-size:')) return html;
  return html.replace(/<span style="([^"]*)">/g, (match, style: string) => {
    if (/(?:^|;)line-height:/.test(style)) return match;
    const size = /(?:^|;)font-size:(\d+(?:\.\d+)?)px/.exec(style);
    if (!size) return match;
    const px = Math.round(Number(size[1]) * lineHeight);
    return `<span style="${style};line-height:${px}px">`;
  });
}

function comparable(text: string): string {
  return text.replace(/[\s\u00a0]+/g, ' ').trim();
}
