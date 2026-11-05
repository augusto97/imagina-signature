import type { CanvasConfig } from '@/core/schema/signature';
import { bgcolorAttr, fontStack, inlineStyle, intPx, safeColor } from './css';

/** Pixel width of the signature (clamped `canvas.width`). */
export function canvasWidth(canvas: CanvasConfig): number {
  return intPx(canvas.width, 200, 1200, 600);
}

/**
 * The outer presentation table that holds the whole signature.
 *
 * This table IS the signature fragment users paste into Gmail /
 * Outlook / Apple Mail, so everything the recipient must see lives on
 * it — in particular the canvas background (as both a `bgcolor`
 * attribute and an inline `background-color` on the table and its
 * cell), which used to sit on `<body>` only and therefore never reached
 * recipients.
 *
 * It always ends with `</td></tr>\n</table>`: the campaign banner and
 * compliance footer are inserted right before that marker.
 *
 * `fluid` (used when a container stacks its columns on mobile) makes
 * the table `width:100%;max-width:Wpx` so narrow clients really are
 * narrower than the columns; Outlook desktop, which ignores
 * `max-width`, gets a fixed-width ghost table around it.
 */
export function buildShellTable(
  content: string,
  canvas: CanvasConfig,
  options: ShellOptions = {},
): string {
  const width = canvasWidth(canvas);
  const bg = safeColor(canvas.background_color, '#ffffff');
  const tableStyle = inlineStyle({
    'border-collapse': 'collapse',
    width: options.fluid ? '100%' : `${width}px`,
    'max-width': options.fluid ? `${width}px` : undefined,
    'background-color': bg,
    'font-family': fontStack(canvas.font_family),
    color: safeColor(canvas.text_color, '#111827'),
  });
  const cellStyle = inlineStyle({ 'background-color': bg });

  const table = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}"${bgcolorAttr(bg)} style="${tableStyle}">
<tr><td${bgcolorAttr(bg)} style="${cellStyle}">
${content}
</td></tr>
</table>`;
  if (!options.fluid) return table;
  return `<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}"><tr><td><![endif]-->${table}<!--[if mso]></td></tr></table><![endif]-->`;
}

export interface ShellOptions {
  /** Fluid width up to the canvas width (see {@link buildShellTable}). */
  fluid?: boolean;
}

/**
 * Wraps the shell table in an email-safe document (CLAUDE.md §9.3):
 * proper DOCTYPE, charset / viewport metas and the mso conditional that
 * locks Outlook's pixel-per-inch math.
 *
 * Every canvas value goes through the central serializer (`css.ts`) —
 * a font stack such as `"Courier New", Courier, monospace` used to be
 * interpolated raw and its double quotes closed the `style` attribute.
 */
export function wrapDocument(shellTable: string, canvas: CanvasConfig): string {
  const bodyStyle = inlineStyle({
    margin: 0,
    padding: 0,
    background: safeColor(canvas.background_color, '#ffffff'),
  });

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<title>Email Signature</title>
</head>
<body style="${bodyStyle}">
${shellTable}
</body>
</html>`;
}

/** Shell table + document in one go (kept for existing callers). */
export function wrapInEmailShell(
  content: string,
  canvas: CanvasConfig,
  options: ShellOptions = {},
): string {
  return wrapDocument(buildShellTable(content, canvas, options), canvas);
}
