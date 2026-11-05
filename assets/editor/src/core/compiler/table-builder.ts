import type { CanvasConfig } from '@/core/schema/signature';
import { fontStack, inlineStyle, intPx, safeColor } from './css';

/**
 * Wraps the per-block compiled HTML in an email-safe document shell
 * (CLAUDE.md §9.3): proper DOCTYPE, charset / viewport metas, mso
 * conditional that locks Outlook's pixel-per-inch math, and an outer
 * presentation table sized to the configured canvas width.
 *
 * Every canvas value goes through the central serializer (`css.ts`) —
 * a font stack such as `"Courier New", Courier, monospace` used to be
 * interpolated raw and its double quotes closed the `style` attribute.
 */
export function wrapInEmailShell(content: string, canvas: CanvasConfig): string {
  const width = intPx(canvas.width, 200, 1200, 600);
  const bodyStyle = inlineStyle({
    margin: 0,
    padding: 0,
    background: safeColor(canvas.background_color, '#ffffff'),
  });
  const tableStyle = inlineStyle({
    'border-collapse': 'collapse',
    width: `${width}px`,
    'font-family': fontStack(canvas.font_family),
    color: safeColor(canvas.text_color, '#111827'),
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
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="${tableStyle}">
<tr><td>
${content}
</td></tr>
</table>
</body>
</html>`;
}
