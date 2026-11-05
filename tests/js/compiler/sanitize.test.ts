import { describe, expect, it } from 'vitest';
import { isSafeHref, sanitizeEmailHtml } from '@/core/compiler/sanitize';

/**
 * Parses sanitiser output and asserts nothing executable survived:
 * no element outside the allowlist, no on* handler, no attribute
 * outside the per-tag allowlist, no dangerous URL.
 */
const ALLOWED_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'A', 'BR', 'SPAN', 'P']);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href', 'title', 'target', 'rel', 'style']),
};
const DEFAULT_ATTRS = new Set(['style']);

function assertInert(html: string): void {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    expect(ALLOWED_TAGS.has(el.tagName), `tag <${el.tagName}> in ${html}`).toBe(true);
    const allowed = ALLOWED_ATTRS[el.tagName] ?? DEFAULT_ATTRS;
    for (const a of Array.from(el.attributes)) {
      expect(allowed.has(a.name), `attr ${a.name} on <${el.tagName}> in ${html}`).toBe(true);
      expect(a.name.startsWith('on')).toBe(false);
    }
    const href = el.getAttribute('href');
    if (href !== null) {
      expect(/^(https?:|mailto:|tel:|\{\{)/i.test(href.trim()), `href ${href}`).toBe(true);
    }
    const style = el.getAttribute('style') ?? '';
    expect(/url\(|expression|javascript/i.test(style)).toBe(false);
  }
  // Belt and braces on the raw string too.
  // (on* text may legitimately survive inside an escaped title value.)
  expect(/<script|<img|<svg|<iframe|<object|<embed|javascript:/i.test(html)).toBe(false);
}

const VECTORS: Array<[string, string]> = [
  ['img onerror', '<img src=x onerror=alert(1)>'],
  ['img inside an unknown wrapper', '<section><img src=x onerror=alert(1)></section>'],
  [
    'deeply nested unknown wrappers',
    '<x-a><x-b><div><img src=x onerror=alert(1)></div></x-b></x-a>',
  ],
  ['script tag', '<script>alert(1)</script>'],
  ['script inside allowed tag', '<strong><script>alert(1)</script>bold</strong>'],
  ['svg onload', '<svg onload=alert(1)><circle r=1 /></svg>'],
  ['svg script', '<svg><script>alert(1)</script></svg>'],
  ['math href', '<math><mi xlink:href="javascript:alert(1)">x</mi></math>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['object data', '<object data="javascript:alert(1)"></object>'],
  ['embed', '<embed src="javascript:alert(1)">'],
  ['javascript href', '<a href="javascript:alert(1)">x</a>'],
  ['JaVaScRiPt href', '<a href="JaVaScRiPt:alert(1)">x</a>'],
  ['entity-encoded tab in scheme', '<a href="jav&#x09;ascript:alert(1)">x</a>'],
  ['entity-encoded newline in scheme', '<a href="jav&#x0A;ascript:alert(1)">x</a>'],
  ['entity-encoded colon', '<a href="javascript&colon;alert(1)">x</a>'],
  [
    'decimal entities',
    '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',
  ],
  ['leading whitespace / control', '<a href=" \u0001javascript:alert(1)">x</a>'],
  ['data:text/html', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
  ['vbscript', '<a href="vbscript:msgbox(1)">x</a>'],
  ['onclick on allowed tag', '<a href="https://ok.example" onclick="alert(1)">x</a>'],
  ['onmouseover on span', '<span onmouseover="alert(1)">x</span>'],
  [
    'attribute breaking quotes',
    '<a href="https://ok.example" title=\'"><img src=x onerror=alert(1)>\'>x</a>',
  ],
  ['style expression', '<span style="color:red;width:expression(alert(1))">x</span>'],
  ['style url', '<span style="background:url(javascript:alert(1));color:#f00">x</span>'],
  ['style breaking out', '<span style="color:red&quot;onmouseover=alert(1)">x</span>'],
  [
    'form controls',
    '<form action="javascript:alert(1)"><input autofocus onfocus=alert(1)><button>x</button></form>',
  ],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],
  ['link stylesheet', '<link rel="stylesheet" href="javascript:alert(1)">'],
  ['base href', '<base href="javascript:alert(1)//">'],
  ['template content', '<template><img src=x onerror=alert(1)></template>'],
  ['noscript mXSS', '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>'],
  ['style tag', '<style>@import "javascript:alert(1)";</style>'],
  ['textarea breakout', '<textarea></textarea><img src=x onerror=alert(1)>'],
  ['comment breakout', '<!--><img src=x onerror=alert(1)>-->'],
  ['unclosed tag soup', '<a href="https://ok.example"<img src=x onerror=alert(1)>'],
  ['nested anchors', '<a href="javascript:alert(1)"><a href="https://ok.example">x</a></a>'],
  ['details ontoggle', '<details open ontoggle=alert(1)>x</details>'],
  ['video poster', '<video poster="javascript:alert(1)"><source src=x onerror=alert(1)></video>'],
];

describe('sanitizeEmailHtml XSS battery', () => {
  it.each(VECTORS)('neutralises %s', (_name, payload) => {
    const out = sanitizeEmailHtml(payload);
    assertInert(out);
  });

  it('keeps the text of unwrapped tags', () => {
    expect(sanitizeEmailHtml('<section>Hello <div>world</div></section>')).toBe('Hello world');
  });

  it('drops dangerous containers including their text', () => {
    expect(sanitizeEmailHtml('a<script>alert(1)</script>b')).toBe('ab');
    expect(sanitizeEmailHtml('a<style>p{}</style>b')).toBe('ab');
  });

  it('keeps allowed formatting and safe links', () => {
    const out = sanitizeEmailHtml(
      '<strong>Jane</strong> <em>Doe</em> <a href="https://acme.example" target="_blank" rel="noopener">site</a>',
    );
    expect(out).toBe(
      '<strong>Jane</strong> <em>Doe</em> <a href="https://acme.example" target="_blank" rel="noopener">site</a>',
    );
  });

  it('removes unsafe hrefs but keeps the link text', () => {
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('allows mailto, tel and {{variable}} hrefs', () => {
    expect(sanitizeEmailHtml('<a href="mailto:a@b.c">m</a>')).toContain('href="mailto:a@b.c"');
    expect(sanitizeEmailHtml('<a href="tel:+1">t</a>')).toContain('href="tel:+1"');
    expect(sanitizeEmailHtml('<a href="{{website}}">w</a>')).toContain('href="{{website}}"');
  });

  it('only accepts target=_blank and known rel tokens', () => {
    const out = sanitizeEmailHtml(
      '<a href="https://x.example" target="top" rel="opener noopener evil">x</a>',
    );
    expect(out).toBe('<a href="https://x.example" rel="noopener">x</a>');
  });

  it('keeps only allowlisted style properties with valid values', () => {
    const out = sanitizeEmailHtml(
      '<span style="color: #FF0000; font-weight: bold; position: fixed; font-style: italic; text-decoration: underline; color: url(x)">x</span>',
    );
    expect(out).toBe(
      '<span style="color:#ff0000;font-weight:bold;font-style:italic;text-decoration:underline">x</span>',
    );
  });

  it('gives paragraphs margin:0', () => {
    expect(sanitizeEmailHtml('<p>One</p><p>Two</p>')).toBe(
      '<p style="margin:0">One</p><p style="margin:0">Two</p>',
    );
    expect(sanitizeEmailHtml('<p style="color:#123456" class="x">A</p>')).toBe(
      '<p style="margin:0;color:#123456">A</p>',
    );
  });

  it('applies the link colour when asked', () => {
    expect(sanitizeEmailHtml('<a href="https://x.example">x</a>', { linkColor: '#0d9488' })).toBe(
      '<a href="https://x.example" style="color:#0d9488;text-decoration:underline">x</a>',
    );
    // Invalid colour falls back instead of leaking into the attribute.
    expect(
      sanitizeEmailHtml('<a href="https://x.example">x</a>', { linkColor: '"><script>' }),
    ).toBe('<a href="https://x.example" style="color:#1d4ed8;text-decoration:underline">x</a>');
  });

  it('escapes text and keeps non-breaking spaces', () => {
    expect(sanitizeEmailHtml('a &lt;b&gt; &amp; c&nbsp;d')).toBe('a &lt;b&gt; &amp; c&nbsp;d');
  });
});

describe('isSafeHref', () => {
  it.each([
    'https://a.example',
    'http://a.example',
    'mailto:a@b.c',
    'tel:+1',
    '{{site}}',
    ' HTTPS://A.example',
  ])('accepts %s', (href) => expect(isSafeHref(href)).toBe(true));

  it.each([
    'javascript:alert(1)',
    'jav\tascript:alert(1)',
    'data:text/html,x',
    '//evil.example',
    'www.example.com',
    'blob:x',
  ])('rejects %s', (href) => expect(isSafeHref(href)).toBe(false));
});
