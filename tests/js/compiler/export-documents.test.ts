import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import {
  UTF8_BOM,
  buildOutlookSignatureDocument,
  buildPlainTextSignature,
  buildStandaloneSignaturePage,
  signatureFileBaseName,
} from '@/core/compiler/export-documents';
import { fragmentImages, gmailPreflight } from '@/core/compiler/preflight';
import type { CompileIssue } from '@/core/compiler/issues';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import '@/core/blocks';

function compile(blocks: Block[]) {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  return compileSignature(schema);
}

const img = (src: string) => `<img src="${src}" alt="x" width="10" height="10">`;
const status = (r: ReturnType<typeof gmailPreflight>, id: string) =>
  r.checks.find((c) => c.id === id)?.status;

describe('Gmail pre-flight', () => {
  it('passes a clean fragment and reports the character count', () => {
    const fragment = `<table><tr><td>${img('https://cdn.example/a.png')}</td></tr></table>`;
    const r = gmailPreflight({ fragment, issues: [] });
    expect(r.blocked).toBe(false);
    expect(r.characters).toBe(fragment.length);
    expect(r.limit).toBe(10_000);
    expect(r.images).toBe(1);
    expect(r.checks.every((c) => c.status === 'ok')).toBe(true);
    expect(r.checks.find((c) => c.id === 'length')!.label).toContain(
      `${fragment.length} of 10,000`,
    );
  });

  it('fails (and blocks) above 10,000 characters, passes at exactly 10,000', () => {
    const base = '<table><tr><td></td></tr></table>';
    const exact = base + 'x'.repeat(10_000 - base.length);
    expect(exact.length).toBe(10_000);
    expect(status(gmailPreflight({ fragment: exact, issues: [] }), 'length')).toBe('ok');
    const over = gmailPreflight({ fragment: `${exact}x`, issues: [] });
    expect(status(over, 'length')).toBe('fail');
    expect(over.blocked).toBe(true);
    expect(over.checks.find((c) => c.id === 'length')!.label).toContain('10,001');
  });

  it('fails on data: URIs left in the fragment or removed by the compiler', () => {
    expect(
      status(gmailPreflight({ fragment: img('data:image/png;base64,AA'), issues: [] }), 'data-uri'),
    ).toBe('fail');
    const removed: CompileIssue[] = [
      { level: 'error', message: 'embedded', code: 'data-uri', blockId: 'a' },
    ];
    const r = gmailPreflight({ fragment: '<table></table>', issues: removed });
    expect(status(r, 'data-uri')).toBe('fail');
    expect(r.blocked).toBe(true);
    expect(r.errors).toHaveLength(1);
  });

  it('warns on http:// images and fails on unreachable hosts', () => {
    const http = gmailPreflight({ fragment: img('http://cdn.example/a.png'), issues: [] });
    expect(status(http, 'https')).toBe('warn');
    expect(http.blocked).toBe(false);

    for (const host of ['localhost', 'intranet.local', 'site.test', '192.168.1.20', '127.0.0.1']) {
      const r = gmailPreflight({ fragment: img(`https://${host}/a.png`), issues: [] });
      expect(status(r, 'hosts'), host).toBe('fail');
      expect(r.blocked).toBe(true);
    }
    expect(
      status(gmailPreflight({ fragment: img('https://acme.com/a.png'), issues: [] }), 'hosts'),
    ).toBe('ok');
  });

  it('blocks on any error-level issue', () => {
    const r = gmailPreflight({
      fragment: '<table></table>',
      issues: [{ level: 'error', message: 'broken', code: 'unsafe-url' }],
    });
    expect(r.blocked).toBe(true);
    expect(
      gmailPreflight({ fragment: '<table></table>', issues: [{ level: 'warning', message: 'w' }] })
        .blocked,
    ).toBe(false);
  });

  it('ignores Outlook-only conditional images (Gmail drops them)', () => {
    const images = fragmentImages(
      `<!--[if mso]>${img('http://localhost/fallback.png')}<![endif]-->${img('https://cdn.example/a.png?a=1&amp;b=2')}`,
    );
    expect(images).toEqual([
      { src: 'https://cdn.example/a.png?a=1&b=2', kind: 'https', host: 'cdn.example' },
    ]);
  });

  it('works on real compile output', () => {
    const result = compile([
      { id: 'logo', type: 'image', src: 'data:image/png;base64,AA', alt: 'Logo', width: 100 },
    ]);
    const r = gmailPreflight(result);
    expect(status(r, 'data-uri')).toBe('fail');
    expect(r.blocked).toBe(true);
  });
});

describe('Outlook signature document (.htm)', () => {
  const fragment =
    '<table role="presentation" width="600"><tbody><tr><td>Jane <b>Doe</b></td></tr></tbody></table>';
  const doc = buildOutlookSignatureDocument(fragment, { lang: 'es-ES', dir: 'ltr', title: 'Jane' });
  const parsed = new DOMParser().parseFromString(doc, 'text/html');

  it('declares the Office namespaces Word expects', () => {
    const html = parsed.documentElement;
    expect(html.getAttribute('xmlns:o')).toBe('urn:schemas-microsoft-com:office:office');
    expect(html.getAttribute('xmlns:v')).toBe('urn:schemas-microsoft-com:vml');
    expect(html.getAttribute('xmlns:w')).toBe('urn:schemas-microsoft-com:office:word');
    expect(html.getAttribute('lang')).toBe('es-ES');
    expect(html.getAttribute('dir')).toBe('ltr');
  });

  it('declares UTF-8 and identifies as a Word document', () => {
    expect(parsed.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
    expect(
      parsed.querySelector('meta[http-equiv="Content-Type"]')?.getAttribute('content'),
    ).toContain('charset=utf-8');
    expect(parsed.querySelector('meta[name="ProgId"]')?.getAttribute('content')).toBe(
      'Word.Document',
    );
    expect(parsed.title).toBe('Jane');
    expect(doc).toContain('<o:PixelsPerInch>96</o:PixelsPerInch>');
  });

  it('puts exactly the fragment in the body', () => {
    const section = parsed.querySelector('body > div.WordSection1')!;
    expect(section).not.toBeNull();
    expect(section.innerHTML.trim()).toBe(fragment);
    expect(parsed.body.querySelectorAll('table')).toHaveLength(1);
    expect(parsed.body.textContent?.trim()).toBe('Jane Doe');
  });

  it('escapes the title', () => {
    expect(buildOutlookSignatureDocument('', { title: '<b>"x"</b>' })).toContain(
      '<title>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>',
    );
  });

  it('plain-text companion uses Windows line endings', () => {
    expect(buildPlainTextSignature('Jane\nDoe\r\nacme.com\n\n')).toBe(
      'Jane\r\nDoe\r\nacme.com\r\n',
    );
    expect(UTF8_BOM).toBe('\uFEFF');
  });
});

describe('standalone signature page (Apple Mail)', () => {
  it('holds only the signature so select-all copies nothing else', () => {
    const fragment = '<table><tbody><tr><td>Jane</td></tr></tbody></table>';
    const page = buildStandaloneSignaturePage(fragment, { lang: 'en-US', title: 'Copy me' });
    const parsed = new DOMParser().parseFromString(page, 'text/html');
    expect(parsed.body.innerHTML.trim()).toBe(fragment);
    expect(parsed.documentElement.getAttribute('lang')).toBe('en-US');
    expect(parsed.title).toBe('Copy me');
    expect(parsed.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
  });
});

describe('signature file names', () => {
  it('strips characters Windows forbids and reserved names', () => {
    expect(signatureFileBaseName('Jane Doe / Sales: EMEA?')).toBe('Jane Doe Sales EMEA');
    expect(signatureFileBaseName('  trailing dots... ')).toBe('trailing dots');
    expect(signatureFileBaseName('CON')).toBe('Signature');
    expect(signatureFileBaseName('', 'Mine')).toBe('Mine');
    expect(signatureFileBaseName('x'.repeat(100))).toHaveLength(60);
  });
});
