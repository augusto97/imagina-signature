import type { CanvasConfig } from '@/core/schema/signature';

/**
 * Wraps the per-block compiled HTML in an email-safe document shell
 * (CLAUDE.md §9.3): proper DOCTYPE, charset / viewport metas, mso
 * conditional that locks Outlook's pixel-per-inch math, and an outer
 * presentation table sized to the configured canvas width.
 */
export function wrapInEmailShell(content: string, canvas: CanvasConfig): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<title>Email Signature</title>
</head>
<body style="margin:0;padding:0;background:${canvas.background_color};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${canvas.width}" style="border-collapse:collapse;width:${canvas.width}px;font-family:${canvas.font_family};color:${canvas.text_color};">
<tr><td>
${content}
</td></tr>
</table>
</body>
</html>`;
}
