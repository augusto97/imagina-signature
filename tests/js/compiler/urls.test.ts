import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { classifyUrl, decodeEntities, enforceSafeUrls, isLocalHost, isPlaceholderHost } from '@/core/compiler/urls';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import type { CompileIssue } from '@/core/compiler/issues';
import { validateEmailOutput } from '@/core/compiler/validate';
import '@/core/blocks';

function compile(blocks: Block[], variables: Record<string, string> = {}) {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  schema.variables = variables;
  return compileSignature(schema);
}

const button = (href: string): Block => ({
  id: 'btn',
  type: 'button_cta',
  label: 'Go',
  href,
  background_color: '#000000',
  text_color: '#ffffff',
  border_radius: 4,
});

const image = (src: string, alt = 'Logo'): Block => ({ id: 'img1', type: 'image', src, alt, width: 100 });

describe('classifyUrl', () => {
  it.each([
    ['https://a.example', 'https'],
    ['http://a.example', 'http'],
    ['mailto:a@b', 'mailto'],
    ['tel:1', 'tel'],
    ['#', 'hash'],
    ['', 'empty'],
    ['data:image/png;base64,AAAA', 'data'],
    ['javascript:alert(1)', 'unsafe'],
    ['jav&#x09;ascript:alert(1)', 'unsafe'],
    ['&#106;avascript:alert(1)', 'unsafe'],
    ['blob:https://x/1', 'unsafe'],
    ['/relative.png', 'unsafe'],
    ['&#104;ttps://a.example', 'https'],
  ])('%s → %s', (url, kind) => {
    expect(classifyUrl(url)).toBe(kind);
  });

  it('decodes numeric and named references', () => {
    expect(decodeEntities('a&amp;b&#x3A;&#58;&colon;')).toBe('a&b:::');
  });

  it('recognises unreachable and placeholder hosts', () => {
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('192.168.1.10')).toBe(true);
    expect(isLocalHost('mysite.local')).toBe(true);
    expect(isLocalHost('dev.test')).toBe(true);
    expect(isLocalHost('example.com')).toBe(false);
    expect(isPlaceholderHost('placehold.co')).toBe(true);
    expect(isPlaceholderHost('via.placeholder.com')).toBe(true);
    expect(isPlaceholderHost('dummyimage.com')).toBe(true);
    expect(isPlaceholderHost('cdn.example.com')).toBe(false);
  });
});

describe('URL pass after variable substitution', () => {
  it('disables a javascript: href that arrives through a variable', () => {
    const result = compile([button('{{site}}')], { site: 'javascript:alert(1)' });
    expect(result.html).not.toMatch(/javascript:/i);
    expect(result.html).toContain('href="#"');
    expect(result.issues.some((i) => i.level === 'error' && i.code === 'unsafe-url' && i.blockId === 'btn')).toBe(true);
  });

  it('checks hrefs inside Outlook conditional comments (VML button)', () => {
    const result = compile([button('javascript:alert(1)')]);
    const vml = /<v:roundrect[^>]*>/.exec(result.html)?.[0] ?? '';
    expect(vml).toContain('href="#"');
  });

  it('keeps http, https, mailto and tel links', () => {
    const result = compile([
      {
        id: 'c',
        type: 'contact_row',
        rows: [
          { icon: 'email', label: 'm', href: 'mailto:a@b.example' },
          { icon: 'phone', label: 't', href: 'tel:+1' },
          { icon: 'web', label: 'w', href: 'https://acme.example' },
        ],
        style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#111111' },
      },
    ]);
    expect(result.html).toContain('href="mailto:a@b.example"');
    expect(result.html).toContain('href="tel:+1"');
    expect(result.html).toContain('href="https://acme.example"');
    expect(result.errors).toEqual([]);
  });

  it('removes data: images with an error naming the block', () => {
    const result = compile([image('data:image/png;base64,iVBORw0KGgo=')]);
    expect(result.html).not.toContain('data:');
    expect(result.html).not.toContain('<img');
    const err = result.issues.find((i) => i.code === 'data-uri');
    expect(err?.level).toBe('error');
    expect(err?.blockId).toBe('img1');
    expect(err?.message).toContain('Image');
  });

  it('removes javascript: and blob: images with errors', () => {
    for (const src of ['javascript:alert(1)', 'blob:https://x/123']) {
      const result = compile([image(src)]);
      expect(result.html).not.toContain('<img');
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('keeps http images but warns', () => {
    const result = compile([image('http://cdn.example.com/a.png')]);
    expect(result.html).toContain('src="http://cdn.example.com/a.png"');
    expect(result.issues.some((i) => i.code === 'insecure-image' && i.level === 'warning')).toBe(true);
  });

  it('warns about local and placeholder image hosts', () => {
    expect(compile([image('https://localhost/a.png')]).issues.some((i) => i.code === 'local-image')).toBe(true);
    expect(compile([image('https://placehold.co/120')]).issues.some((i) => i.code === 'placeholder-image')).toBe(true);
  });

  it('warns about missing alt text naming the block type', () => {
    const result = compile([image('https://cdn.example.com/a.png', '')]);
    const w = result.issues.find((i) => i.code === 'missing-alt');
    expect(w?.blockType).toBe('image');
    expect(w?.message).toMatch(/^Image block/);
    expect(w?.message).not.toContain('#');
  });

  it('never leaks compile-time markers', () => {
    const result = compile([image('https://cdn.example.com/a.png'), button('https://acme.example')]);
    expect(result.html).not.toContain('data-imgsig-src');
  });

  it('rewrites unsafe href on raw markup and strips non-http src attributes', () => {
    const sink = { issues: [] as CompileIssue[] };
    const out = enforceSafeUrls(
      '<a href="data:text/html,x">a</a><td background="javascript:x">b</td><img src="https://ok.example/a.png" alt="">',
      sink,
    );
    expect(out).toBe('<a href="#">a</a><td >b</td><img src="https://ok.example/a.png" alt="">');
    expect(sink.issues.filter((i) => i.level === 'error')).toHaveLength(2);
  });
});

describe('validator levels', () => {
  it('flags leftover data: / javascript: as errors', () => {
    const issues = validateEmailOutput('<div style="background:url(data:image/png;base64,AA)"></div><a href="javascript:x">x</a>');
    expect(issues.filter((i) => i.level === 'error').map((i) => i.code)).toEqual(['data-uri', 'unsafe-url']);
  });

  it('warns when the signature exceeds Gmail’s 10,000-character limit', () => {
    const long = `<table><tr><td>${'x'.repeat(10_050)}</td></tr></table>`;
    const issues = validateEmailOutput(`<html><body>${long}</body></html>`, long);
    expect(issues.some((i) => i.code === 'too-long' && i.level === 'warning')).toBe(true);
  });

  it('warns about the 102 KB Gmail clipping limit', () => {
    const big = 'x'.repeat(103 * 1024);
    expect(validateEmailOutput(big, 'short').some((i) => i.code === 'too-large')).toBe(true);
  });

  it('keeps `warnings` as plain strings and splits out `errors`', () => {
    const result = compile([image('data:image/png;base64,AA', ''), image('https://placehold.co/1', 'x')]);
    expect(result.errors.length).toBe(1);
    expect(result.warnings.every((w) => typeof w === 'string')).toBe(true);
    expect(result.warnings.some((w) => w.includes('placeholder'))).toBe(true);
  });

  it('flags tiny low-contrast text', () => {
    const result = compile([
      {
        id: 'd',
        type: 'disclaimer',
        content: 'fine print',
        style: { font_family: 'Arial', font_size: 9, font_weight: 400, color: '#dddddd' },
      },
    ]);
    expect(result.issues.some((i) => i.code === 'low-contrast' && i.blockId === 'd')).toBe(true);
  });
});
