import { __ } from '@/i18n/helpers';
import { lowContrastMessage, report, type CompileIssue, type IssueSink } from './issues';
import { findLowContrastText } from './contrast';

export { contrastThreshold, meetsContrast } from './contrast';

/** Gmail refuses to save a signature longer than this many characters. */
export const GMAIL_SIGNATURE_CHAR_LIMIT = 10_000;
/** Gmail clips message bodies larger than this. */
export const GMAIL_CLIP_BYTES = 102 * 1024;

/**
 * Post-compile validation (CLAUDE.md §9.6 / §20.2) on the FINAL html.
 *
 * Never throws. Block-specific checks (alt text, image widths, QR /
 * vCard upload state, URL hosts) are reported where the block is
 * known — during block compile and in the URL pass — so this pass only
 * looks at document-level properties plus leftovers from markup the
 * compiler does not own (compliance footer, campaign banner).
 *
 * @param html     The complete document.
 * @param fragment The pasteable signature fragment (defaults to `html`).
 */
export function validateEmailOutput(html: string, fragment: string = html): CompileIssue[] {
  const sink = { issues: [] as CompileIssue[] };

  const size = new Blob([html]).size;
  if (size > GMAIL_CLIP_BYTES) {
    report(
      sink,
      'warning',
      __('The HTML is %s KB; Gmail clips messages over 102 KB.', (size / 1024).toFixed(1)),
      null,
      'too-large',
    );
  }

  if (fragment.length > GMAIL_SIGNATURE_CHAR_LIMIT) {
    report(
      sink,
      'warning',
      __(
        'The signature is %s characters long; Gmail rejects signatures over 10,000 characters.',
        fragment.length.toLocaleString('en-US'),
      ),
      null,
      'too-long',
    );
  }

  // Anything dangerous that slipped past the URL pass (e.g. inside an
  // inline style of admin-provided footer HTML).
  if (/(?:href|src|background|poster)\s*=\s*["']?\s*data:|url\(\s*["']?\s*data:/i.test(html)) {
    report(sink, 'error', __('The HTML still contains an embedded data: URI.'), null, 'data-uri');
  }
  if (
    /(?:href|src|background|poster)\s*=\s*["']?\s*(?:java|vb)script:|url\(\s*["']?\s*(?:java|vb)script:/i.test(
      html,
    )
  ) {
    report(sink, 'error', __('The HTML still contains a script URL.'), null, 'unsafe-url');
  }
  if (/(?:href|src)\s*=\s*["']?\s*blob:/i.test(html)) {
    report(sink, 'error', __('The HTML still contains a temporary blob: URL.'), null, 'unsafe-url');
  }

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const img of imgs) {
    if (!/\salt\s*=/i.test(img)) {
      report(sink, 'warning', __('An image has no alt attribute.'), null, 'missing-alt');
    }
    if (!/\swidth\s*=\s*["']?\d+/i.test(img) && !/width:\s*\d+/i.test(img)) {
      report(
        sink,
        'warning',
        __('An image has no explicit width; Outlook may show it at full size.'),
        null,
        'missing-width',
      );
    }
  }

  const links = html.match(/<a\b[^>]*>/gi) ?? [];
  for (const link of links) {
    if (!/\shref\s*=\s*["'][^"']*["']/i.test(link)) {
      report(sink, 'warning', __('A link has no href.'), null, 'empty-link');
    }
  }

  return sink.issues;
}

/**
 * Text-contrast validation (WCAG AA): every visible run of text is
 * compared with its EFFECTIVE background — the nearest box, container
 * column, button cell or canvas background in the compiled markup.
 * Normal text needs 4.5:1; large text (≥ 18 px, or bold ≥ 14 px) 3:1.
 *
 * Runs on the document while it still carries the compile-time block
 * boundary markers, so each warning names (and links to) its block.
 * One warning per block and colour / background / size combination.
 */
export function validateContrast(html: string, sink: IssueSink): void {
  for (const finding of findLowContrastText(html)) {
    report(
      sink,
      'warning',
      lowContrastMessage(finding.block, finding.fontSize, finding.ratio),
      finding.block,
      'low-contrast',
    );
  }
}

/**
 * Back-compat wrapper returning plain message strings.
 *
 * @deprecated Use {@link validateEmailOutput} for leveled issues.
 */
export function validateEmailHtml(html: string): string[] {
  return validateEmailOutput(html).map((i) => i.message);
}
