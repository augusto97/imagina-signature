import { attr, escapeHtml } from './css';

/**
 * Standalone documents built around the compiled signature FRAGMENT
 * for client-specific installs. Pure string builders.
 */

export interface DocumentLanguage {
  /** BCP 47 tag ('' / undefined → omitted). */
  lang?: string;
  dir?: 'ltr' | 'rtl';
}

function languageAttrs({ lang, dir }: DocumentLanguage): string {
  const l =
    lang && /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(lang) ? ` lang="${attr(lang)}"` : '';
  const d = dir === 'rtl' || dir === 'ltr' ? ` dir="${dir}"` : '';
  return `${l}${d}`;
}

/**
 * Signature file for classic Outlook for Windows
 * (`%APPDATA%\Microsoft\Signatures\<name>.htm`).
 *
 * Mirrors what Outlook / Word write themselves: the Office XML
 * namespaces (o / v / w / m), `ProgId=Word.Document`, an explicit UTF-8
 * charset (both `<meta charset>` and the http-equiv form Word reads),
 * Office document settings (96 PPI, PNG allowed) and a reset for Word's
 * default paragraph spacing. The signature fragment sits in
 * `<div class="WordSection1">` inside `<body>`.
 */
export function buildOutlookSignatureDocument(
  fragment: string,
  options: DocumentLanguage & { title?: string } = {},
): string {
  const title = escapeHtml(options.title ?? 'Signature');
  const bodyLang = options.lang ? ` lang="${attr(options.lang)}"` : '';
  return `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" xmlns="http://www.w3.org/TR/REC-html40"${languageAttrs(options)}>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<meta name="Originator" content="Microsoft Word 15">
<title>${title}</title>
<!--[if gte mso 9]><xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml><![endif]-->
<!--[if gte mso 9]><xml>
<w:WordDocument>
<w:View>Normal</w:View>
<w:Zoom>0</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->
<style>
p.MsoNormal, li.MsoNormal, div.MsoNormal { margin: 0; }
table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
td { mso-line-height-rule: exactly; }
img { border: 0; -ms-interpolation-mode: bicubic; }
div.WordSection1 { page: WordSection1; }
</style>
</head>
<body${bodyLang} style="margin:0;padding:0">
<div class="WordSection1">
${fragment}
</div>
</body>
</html>
`;
}

/**
 * Plain-text signature file (`<name>.txt`) Outlook uses for plain-text
 * messages: Windows line endings.
 */
export function buildPlainTextSignature(text: string): string {
  return `${text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n').trimEnd()}\r\n`;
}

/**
 * A page holding ONLY the signature, for "open in a new tab → select
 * all → copy" installs (Apple Mail). No instructions inside the page:
 * Cmd+A must select the signature and nothing else, so the hint lives
 * in the tab title.
 */
export function buildStandaloneSignaturePage(
  fragment: string,
  options: DocumentLanguage & { title?: string } = {},
): string {
  const title = escapeHtml(options.title ?? 'Signature');
  return `<!DOCTYPE html>
<html${languageAttrs(options)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:24px;background:#ffffff">
${fragment}
</body>
</html>
`;
}

/**
 * Windows-safe base file name (no extension) for the signature files:
 * reserved characters / names removed, trailing dots and spaces trimmed,
 * at most 60 characters. Falls back to `fallback`.
 */
export function signatureFileBaseName(name: string, fallback = 'Signature'): string {
  const cleaned = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/, '');
  if (cleaned === '' || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) return fallback;
  return cleaned;
}

/** UTF-8 byte-order mark: lets Outlook / Notepad detect the encoding of a downloaded file. */
export const UTF8_BOM = '\uFEFF';
