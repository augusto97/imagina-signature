import type { TextBlock } from '@/core/schema/blocks';
import type { CompileContext } from '@/core/blocks/registry';
import { sanitizeEmailHtml } from '@/core/compiler/sanitize';
import { inlineStyle, paddingCss, safeColor } from '@/core/compiler/css';
import { checkContrast, markerAttr, type BlockRef } from '@/core/compiler/issues';
import { scaleSpanLineHeights } from './richText';
import {
  TEXT_TYPOGRAPHY,
  resolveTypography,
  typographyDeclarations,
  type TypographyDefaults,
} from './typography';
import type { Padding, TextStyle } from '@/core/schema/styles';

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
 * Unset family / size / colour inherit the canvas (`ctx.canvas`).
 */
export function compileText(block: TextBlock, ctx: CompileContext): string {
  return compileRichTextCell(
    block,
    block.content,
    block.style,
    block.padding,
    ctx,
    TEXT_TYPOGRAPHY,
  );
}

/**
 * Shared single-cell rich-text compile (text, heading, disclaimer).
 *
 * Links pick up the canvas link colour (the sanitiser drops any inline
 * style on <a>); paragraphs get margin:0 so mail clients don't add
 * their ~1em default spacing the canvas never showed. With an explicit
 * line height the cell carries it in px (+ mso-line-height-rule) and
 * resized spans get a matching px line height.
 */
export function compileRichTextCell(
  block: BlockRef,
  html: string,
  style: TextStyle | undefined,
  padding: Padding | undefined,
  ctx: CompileContext,
  defaults: TypographyDefaults,
): string {
  const t = resolveTypography(style, ctx.canvas, defaults);
  checkContrast(ctx, block, t.color, safeColor(ctx.canvas.background_color, '#ffffff'), t.fontSize);
  const cellStyle = inlineStyle({
    ...typographyDeclarations(t),
    padding: paddingCss(padding),
  });

  let safeContent = sanitizeEmailHtml(html, { linkColor: ctx.canvas.link_color }).replace(
    /<a(?=[\s>])/g,
    `<a${markerAttr(block)}`,
  );
  if (t.lineHeightPx !== null) safeContent = scaleSpanLineHeights(safeContent, t.lineHeight);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;"><tr><td style="${cellStyle}">${safeContent}</td></tr></table>`;
}
