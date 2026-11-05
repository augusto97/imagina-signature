import type { TextBlock } from '@/core/schema/blocks';
import type { CompileContext } from '@/core/blocks/registry';
import { sanitizeEmailHtml } from '@/core/compiler/sanitize';
import {
  fontStack,
  fontWeight,
  inlineStyle,
  num,
  paddingCss,
  px,
  safeColor,
  textAlign,
} from '@/core/compiler/css';

/**
 * JSON → email-safe HTML for a Text block.
 *
 * Runs the Tiptap-produced `block.content` through `sanitizeEmailHtml`
 * so the compiled output cannot ship `<script>`, event handlers, or
 * `javascript:` URLs even if a hostile schema (corrupted DB row,
 * tampered template, future Tiptap regression) gets through. Defence
 * in depth — the editor also sanitises before rendering on the canvas.
 *
 * Every style value goes through the central serializer so font
 * stacks with double quotes no longer break the `style` attribute.
 */
export function compileText(block: TextBlock, _ctx: CompileContext): string {
  const style = inlineStyle({
    'font-family': fontStack(block.style.font_family),
    'font-size': `${px(block.style.font_size, 6, 96, 14)}px`,
    'font-weight': fontWeight(block.style.font_weight),
    color: safeColor(block.style.color, '#111827'),
    'line-height': num(block.style.line_height ?? 1.4, 0.5, 4, 1.4),
    'text-align': textAlign(block.style.text_align),
    padding: paddingCss(block.padding),
  });

  const safeContent = sanitizeEmailHtml(block.content);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;"><tr><td style="${style}">${safeContent}</td></tr></table>`;
}
