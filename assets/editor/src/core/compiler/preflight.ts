import { __ } from '@/i18n/helpers';
import { parseAttributes, tokenizeHtml } from './html-tokens';
import type { CompileIssue } from './issues';
import { classifyUrl, decodeEntities, isLocalHost, urlHost } from './urls';
import { GMAIL_SIGNATURE_CHAR_LIMIT } from './validate';

/**
 * Gmail / Google Workspace pre-flight: what Gmail's signature editor
 * will do with the pasted fragment, checked BEFORE the user copies it.
 *
 * Pure: takes the compile output, returns the checklist.
 */

export type PreflightStatus = 'ok' | 'warn' | 'fail';

export interface PreflightCheck {
  id: 'length' | 'data-uri' | 'https' | 'hosts' | 'images';
  status: PreflightStatus;
  /** Translated one-line summary. */
  label: string;
  /** Translated explanation (only for warn / fail). */
  detail?: string;
}

export interface GmailPreflight {
  checks: PreflightCheck[];
  /** Characters of the fragment (what Gmail counts). */
  characters: number;
  limit: number;
  /** Images Gmail will load (Outlook-only conditional copies excluded). */
  images: number;
  /** Error-level compile issues — the export is broken for recipients. */
  errors: CompileIssue[];
  /**
   * True when copying for Gmail should be blocked (the user can still
   * "copy anyway"): an error-level issue or a failed check.
   */
  blocked: boolean;
}

export interface PreflightImage {
  src: string;
  kind: ReturnType<typeof classifyUrl>;
  host: string;
}

/** Images of a fragment as Gmail sees them (conditional comments are dropped by Gmail). */
export function fragmentImages(fragment: string): PreflightImage[] {
  const out: PreflightImage[] = [];
  for (const token of tokenizeHtml(fragment)) {
    if (token.kind !== 'open' || token.name !== 'img') continue;
    const src = decodeEntities(parseAttributes(token.attrs).get('src') ?? '').trim();
    out.push({ src, kind: classifyUrl(src), host: urlHost(src) });
  }
  return out;
}

const DATA_URI_RE = /(?:href|src|background|poster)\s*=\s*["']?\s*data:|url\(\s*["']?\s*data:/i;

export function gmailPreflight(input: {
  fragment: string;
  issues: CompileIssue[];
}): GmailPreflight {
  const { fragment, issues } = input;
  const characters = fragment.length;
  const limit = GMAIL_SIGNATURE_CHAR_LIMIT;
  const images = fragmentImages(fragment);
  const checks: PreflightCheck[] = [];

  const formatted = (n: number): string => n.toLocaleString('en-US');

  checks.push(
    characters <= limit
      ? {
          id: 'length',
          status: 'ok',
          label: __('Length: %s of %s characters', formatted(characters), formatted(limit)),
        }
      : {
          id: 'length',
          status: 'fail',
          label: __('Length: %s of %s characters', formatted(characters), formatted(limit)),
          detail: __(
            'Gmail refuses to save signatures longer than 10,000 characters. Remove blocks, shorten texts or use fewer social icons.',
          ),
        },
  );

  const removedEmbedded = issues.filter((i) => i.code === 'data-uri').length;
  const embeddedInFragment = DATA_URI_RE.test(fragment) ? 1 : 0;
  const embedded = removedEmbedded + embeddedInFragment;
  checks.push(
    embedded === 0
      ? { id: 'data-uri', status: 'ok', label: __('No embedded (data:) images') }
      : {
          id: 'data-uri',
          status: 'fail',
          label: __('%s embedded (data:) image(s)', String(embedded)),
          detail: __(
            'Gmail does not show embedded images. Use "Fix embedded images" or upload them so the signature links to hosted copies.',
          ),
        },
  );

  const insecure = images.filter((i) => i.kind === 'http').length;
  checks.push(
    insecure === 0
      ? { id: 'https', status: 'ok', label: __('All images use https://') }
      : {
          id: 'https',
          status: 'warn',
          label: __('%s image(s) use http://', String(insecure)),
          detail: __(
            'Gmail shows a security warning or blocks insecure images. Host them on an https:// address.',
          ),
        },
  );

  const unreachable = images.filter((i) => isLocalHost(i.host)).length;
  checks.push(
    unreachable === 0
      ? { id: 'hosts', status: 'ok', label: __('All images are on public addresses') }
      : {
          id: 'hosts',
          status: 'fail',
          label: __('%s image(s) on localhost, .local or .test addresses', String(unreachable)),
          detail: __(
            'Recipients (and Gmail’s image proxy) cannot reach these addresses. Upload the images to your public site.',
          ),
        },
  );

  checks.push({
    id: 'images',
    status: 'ok',
    label: __('%s image(s) in total', String(images.length)),
  });

  const errors = issues.filter((i) => i.level === 'error');
  return {
    checks,
    characters,
    limit,
    images: images.length,
    errors,
    blocked: errors.length > 0 || checks.some((c) => c.status === 'fail'),
  };
}
