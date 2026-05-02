import type { TextBlock } from '@/core/schema/blocks';
import type { CompileContext } from '@/core/blocks/registry';
import { sanitizeEmailHtml } from '@/core/compiler/sanitize';

/**
 * JSON → email-safe HTML for a Text block.
 *
 * Runs the Tiptap-produced `block.content` through `sanitizeEmailHtml`
 * so the compiled output cannot ship `<script>`, event handlers, or
 * `javascript:` URLs even if a hostile schema (corrupted DB row,
 * tampered template, future Tiptap regression) gets through. Defence
 * in depth — the editor also sanitises before rendering on the canvas.
 */
export function compileText(block: TextBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p
    ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`
    : '0';

  const styles: Array<[string, string | number]> = [
    ['font-family', block.style.font_family],
    ['font-size', `${block.style.font_size}px`],
    ['font-weight', block.style.font_weight],
    ['color', block.style.color],
    ['line-height', block.style.line_height ?? 1.4],
    ['text-align', block.style.text_align ?? 'left'],
    ['padding', padding],
  ];
  const style = styles.map(([k, v]) => `${k}:${v}`).join(';');

  const safeContent = sanitizeEmailHtml(block.content);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;"><tr><td style="${style}">${safeContent}</td></tr></table>`;
}
