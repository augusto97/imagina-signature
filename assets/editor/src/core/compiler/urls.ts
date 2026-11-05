import { __ } from '@/i18n/helpers';
import { normaliseUrlForScheme } from './sanitize';
import {
  MARKER_ATTR,
  blockLabel,
  parseMarker,
  report,
  stripMarkers,
  type BlockRef,
  type IssueSink,
} from './issues';

/**
 * Final URL safety pass — runs on the COMPLETE document AFTER variable
 * substitution (so `{{site}}` resolving to `javascript:…` is caught)
 * and also inspects markup inside Outlook conditional comments (the
 * VML button's `href`).
 *
 * - `href` (and `xlink:href`): http / https / mailto / tel / `#` are
 *   kept; anything else becomes `#` and an error is reported.
 * - `<img src>`: https is fine; http is kept with a warning; data:,
 *   javascript:, blob: (or any other scheme / relative path) removes
 *   the image and reports an error. Empty src removes the image with a
 *   warning.
 * - Hosts recipients can never reach (localhost, 127.0.0.1, private
 *   ranges, *.local, *.test) and placeholder services (placehold.co …)
 *   produce warnings.
 * - Other URL-bearing attributes (`src` on non-img tags, `background`,
 *   `poster`, `action`, `formaction`) are removed unless http(s).
 *
 * Compile-time `data-imgsig-src` markers are used to name the block in
 * each diagnostic and are stripped from the output.
 */

const TAG_RE = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([^\s"'<>/=]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const LOCAL_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$|\.(?:local|localhost|test|internal|lan)$/;
const PLACEHOLDER_HOSTS = [
  'placehold.co',
  'placehold.it',
  'via.placeholder.com',
  'placeholder.com',
  'dummyimage.com',
];

export type UrlKind = 'https' | 'http' | 'mailto' | 'tel' | 'hash' | 'empty' | 'data' | 'unsafe';

/** Classifies a (possibly entity-encoded) attribute value. */
export function classifyUrl(raw: string): UrlKind {
  const decoded = decodeEntities(raw);
  if (decoded.trim() === '') return 'empty';
  if (decoded.trim() === '#') return 'hash';
  const n = normaliseUrlForScheme(decoded);
  if (n.startsWith('https:')) return 'https';
  if (n.startsWith('http:')) return 'http';
  if (n.startsWith('mailto:')) return 'mailto';
  if (n.startsWith('tel:')) return 'tel';
  if (n.startsWith('data:')) return 'data';
  return 'unsafe';
}

/** Lower-cased host of an http(s) URL, or '' when there is none. */
export function urlHost(raw: string): string {
  const m = /^https?:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^/?#:]*)/i.exec(decodeEntities(raw).trim());
  return m ? m[1]!.toLowerCase() : '';
}

export function isLocalHost(host: string): boolean {
  return host !== '' && LOCAL_HOST.test(host);
}

export function isPlaceholderHost(host: string): boolean {
  return PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function enforceSafeUrls(html: string, sink: IssueSink): string {
  const out = html.replace(TAG_RE, (tag, name: string, body: string) => {
    const lower = name.toLowerCase();
    const attrs = parseAttributes(body);
    const block = parseMarker(attrs.get(MARKER_ATTR)?.value);

    if (lower === 'img') {
      const src = attrs.get('src');
      if (!checkImageSrc(src?.value ?? '', block, sink)) return '';
    }

    let changed = false;
    const nextBody = body.replace(ATTR_RE, (whole, attrName: string, _assign, dq, sq, uq) => {
      const key = attrName.toLowerCase();
      const value = (dq ?? sq ?? uq ?? '') as string;

      if (key === 'href' || key === 'xlink:href') {
        const safe = checkHref(value, block, sink);
        if (safe !== null) {
          changed = true;
          return `${attrName}="${safe}"`;
        }
        return whole;
      }

      if (lower !== 'img' && (key === 'src' || key === 'background' || key === 'poster')) {
        const kind = classifyUrl(value);
        if (kind !== 'https' && kind !== 'http' && kind !== 'empty') {
          reportUnsafe(sink, block, value, kind);
          changed = true;
          return '';
        }
        return whole;
      }

      if (key === 'action' || key === 'formaction') {
        changed = true;
        return '';
      }

      return whole;
    });

    return changed ? `<${name}${nextBody}>` : tag;
  });

  return stripMarkers(out);
}

/**
 * Returns the replacement href when `value` must change, or `null`
 * when it can stay as-is.
 */
function checkHref(value: string, block: BlockRef | null, sink: IssueSink): string | null {
  const kind = classifyUrl(value);
  const label = blockLabel(block?.type);

  switch (kind) {
    case 'hash':
    case 'mailto':
    case 'tel':
      return null;
    case 'empty':
      report(sink, 'warning', __('%s: a link has no URL.', label), block, 'empty-link');
      return '#';
    case 'http':
    case 'https': {
      const host = urlHost(value);
      if (host === '') {
        report(
          sink,
          'warning',
          __('%s: the link "%s" is incomplete (no address after the protocol).', label, truncate(value)),
          block,
          'incomplete-link',
        );
      } else if (isLocalHost(host)) {
        report(
          sink,
          'warning',
          __('%s: the link points to %s, which recipients cannot open.', label, host),
          block,
          'local-link',
        );
      }
      return null;
    }
    default:
      reportUnsafe(sink, block, value, kind);
      return '#';
  }
}

/** Returns false when the `<img>` must be removed. */
function checkImageSrc(value: string, block: BlockRef | null, sink: IssueSink): boolean {
  const kind = classifyUrl(value);
  const label = blockLabel(block?.type);

  if (kind === 'empty' || kind === 'hash') {
    report(
      sink,
      'warning',
      __('%s block has no image URL yet, so it was left out of the export.', label),
      block,
      'missing-image',
    );
    return false;
  }
  if (kind !== 'https' && kind !== 'http') {
    reportUnsafe(sink, block, value, kind);
    return false;
  }

  if (kind === 'http') {
    report(
      sink,
      'warning',
      __('%s block loads its image over http://. Many clients block or warn about insecure images — use https://.', label),
      block,
      'insecure-image',
    );
  }
  const host = urlHost(value);
  if (isLocalHost(host)) {
    report(
      sink,
      'warning',
      __('%s block loads its image from %s, which recipients cannot reach. Upload it to a public site.', label, host),
      block,
      'local-image',
    );
  } else if (isPlaceholderHost(host)) {
    report(
      sink,
      'warning',
      __('%s block still uses a placeholder image (%s). Replace it with your own picture.', label, host),
      block,
      'placeholder-image',
    );
  }
  return true;
}

function reportUnsafe(sink: IssueSink, block: BlockRef | null, value: string, kind: UrlKind): void {
  const label = blockLabel(block?.type);
  if (kind === 'data') {
    report(
      sink,
      'error',
      __('%s block contains an embedded (data:) file. Gmail and Outlook.com do not show embedded images, and one photo can exceed Gmail\'s 10,000-character limit — it was removed. Upload it instead.', label),
      block,
      'data-uri',
    );
    return;
  }
  const scheme = normaliseUrlForScheme(decodeEntities(value)).split(':')[0] ?? '';
  report(
    sink,
    'error',
    scheme === 'javascript' || scheme === 'vbscript'
      ? __('%s block contains a script URL; it was disabled.', label)
      : scheme === 'blob'
        ? __('%s block points to a temporary blob: URL that only exists in your browser; it was removed.', label)
        : __('%s block uses an unsupported URL ("%s"). Only https://, http://, mailto: and tel: work in email.', label, truncate(value)),
    block,
    'unsafe-url',
  );
}

interface ParsedAttr {
  value: string;
}

function parseAttributes(body: string): Map<string, ParsedAttr> {
  const map = new Map<string, ParsedAttr>();
  for (const m of body.matchAll(ATTR_RE)) {
    const name = m[1]!.toLowerCase();
    if (!map.has(name)) map.set(name, { value: (m[3] ?? m[4] ?? m[5] ?? '') as string });
  }
  return map;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  tab: '\t',
  newline: '\n',
  colon: ':',
  sol: '/',
  lpar: '(',
  rpar: ')',
  period: '.',
  comma: ',',
};

/**
 * Decodes numeric and the common named character references. Used for
 * scheme detection only — fail-closed, an undecoded reference can only
 * make a URL fail the allowlist, never pass it.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    const named = NAMED_ENTITIES[ref.toLowerCase()];
    return named ?? whole;
  });
}

function truncate(value: string, max = 60): string {
  const v = decodeEntities(value);
  return v.length > max ? `${v.slice(0, max)}…` : v;
}
