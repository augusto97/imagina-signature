import { __ } from '@/i18n/helpers';
import { parseAttributes, setAttribute, tokenizeHtml } from './html-tokens';
import {
  MARKER_ATTR,
  blockLabel,
  parseBlockMarkerComment,
  parseMarker,
  report,
  type BlockRef,
  type IssueSink,
} from './issues';

/**
 * Accessibility passes on the compiled document: language / direction
 * metadata for the shell and alt-text enforcement on every image.
 */

/** Languages written right-to-left (WordPress locale prefixes). */
const RTL_LANGUAGES = new Set([
  'ar',
  'ary',
  'arz',
  'azb',
  'ckb',
  'dv',
  'fa',
  'haz',
  'he',
  'ps',
  'sd',
  'skr',
  'ug',
  'ur',
  'yi',
]);

/**
 * WordPress locale → BCP 47 language tag: `es_ES` → `es-ES`,
 * `de_DE_formal` → `de-DE`, `pt_PT_ao90` → `pt-PT`, `en` → `en`.
 * Returns '' for anything that does not look like a locale.
 */
export function localeToLang(locale: string | null | undefined): string {
  if (!locale) return '';
  const parts = String(locale)
    .trim()
    .replace(/@.*$/, '')
    .split(/[_-]/)
    .filter((p) => p !== '');
  const language = (parts[0] ?? '').toLowerCase();
  if (!/^[a-z]{2,3}$/.test(language)) return '';
  const region = parts[1] ?? '';
  if (/^[a-z]{2}$/i.test(region) || /^\d{3}$/.test(region)) {
    return `${language}-${region.toUpperCase()}`;
  }
  if (/^[a-z]{4}$/i.test(region)) {
    // Script subtag (zh_Hant, sr_Latn): Title case.
    return `${language}-${region[0]!.toUpperCase()}${region.slice(1).toLowerCase()}`;
  }
  return language;
}

/** Writing direction of a WordPress locale / BCP 47 tag. */
export function localeDirection(locale: string | null | undefined): 'ltr' | 'rtl' {
  const language = String(locale ?? '')
    .trim()
    .split(/[_-]/)[0]!
    .toLowerCase();
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

/**
 * True for images that carry no information — spacer GIFs (≤ 2×2 px)
 * and images explicitly marked presentational — for which an empty
 * `alt=""` is the correct markup.
 */
export function isDecorativeImage(attrs: Map<string, string>): boolean {
  const role = (attrs.get('role') ?? '').toLowerCase();
  if (role === 'presentation' || role === 'none') return true;
  if ((attrs.get('aria-hidden') ?? '').toLowerCase() === 'true') return true;
  const width = dimension(attrs, 'width');
  const height = dimension(attrs, 'height');
  return width !== null && height !== null && width <= 2 && height <= 2;
}

function dimension(attrs: Map<string, string>, name: 'width' | 'height'): number | null {
  const fromAttr = Number.parseFloat(attrs.get(name) ?? '');
  if (Number.isFinite(fromAttr)) return fromAttr;
  const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*(\\d*\\.?\\d+)px`, 'i').exec(
    attrs.get('style') ?? '',
  );
  return m ? Number.parseFloat(m[1]!) : null;
}

/**
 * Makes sure every `<img>` has an `alt` attribute (inserting `alt=""`
 * where it is missing — screen readers then skip the image instead of
 * reading its file name) and warns about every image whose alt text is
 * missing or empty unless it is purely decorative.
 *
 * Block-level `checkAlt()` already reports empty alt text of Image /
 * Avatar / Banner blocks; this pass never repeats a `missing-alt`
 * warning for a block that has one, so it only adds what blocks cannot
 * see (images of other blocks, the campaign banner, footer HTML).
 * Images inside Outlook conditional comments get `alt=""` when needed
 * but no warning — the regular copy of the same image is checked.
 */
export function ensureImageAlts(html: string, sink: IssueSink): string {
  const blocks: Array<BlockRef | null> = [];
  const parts: string[] = [];
  for (const token of tokenizeHtml(html)) {
    if (token.kind === 'comment') {
      const marker = parseBlockMarkerComment(token.raw);
      if (marker === 'end') blocks.pop();
      else if (marker) blocks.push(marker);
      parts.push(
        token.raw.startsWith('<!--[if')
          ? token.raw.replace(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (img) =>
              /\salt\s*=/i.test(img) ? img : setAttribute(img, 'alt', ''),
            )
          : token.raw,
      );
      continue;
    }
    if (token.kind !== 'open' || token.name !== 'img') {
      parts.push(token.raw);
      continue;
    }

    const attrs = parseAttributes(token.attrs);
    const hasAlt = attrs.has('alt');
    const altText = (attrs.get('alt') ?? '').trim();
    parts.push(hasAlt ? token.raw : setAttribute(token.raw, 'alt', ''));
    if (altText !== '' || isDecorativeImage(attrs)) continue;

    const block =
      parseMarker(attrs.get(MARKER_ATTR)) ??
      (blocks.length > 0 ? blocks[blocks.length - 1]! : null);
    if (block && sink.issues.some((i) => i.code === 'missing-alt' && i.blockId === block.id)) {
      continue;
    }
    report(
      sink,
      'warning',
      __(
        '%s block: the image has no alt text, so nothing describes it when images are blocked.',
        blockLabel(block?.type),
      ),
      block,
      'missing-alt',
    );
  }
  return parts.join('');
}
