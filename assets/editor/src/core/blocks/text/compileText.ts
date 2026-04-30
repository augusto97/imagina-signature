import type { TextBlock } from '@/core/schema/blocks';
import type { CompileContext } from '@/core/blocks/registry';

/**
 * JSON → email-safe HTML for a Text block.
 *
 * Sprint 5 stub — emits the same `<table>` structure the canvas
 * renderer uses but as a string. The full compile pipeline (Outlook
 * fixes, variable substitution, sanitisation) lands in Sprint 9.
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

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;"><tr><td style="${style}">${block.content}</td></tr></table>`;
}
