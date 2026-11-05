import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { setAssetsBaseUrl } from '@/core/compiler/assets';
import { createEmptySchema } from '@/core/schema/signature';
import type { SocialIconsBlock } from '@/core/schema/blocks';
import {
  normalizeNetwork,
  normalizeSocialIcons,
  socialHref,
  toV2Patch,
  toneFromColor,
} from '@/core/blocks/social-icons/normalize';
import '@/core/blocks';

const BASE = 'https://acme.example/wp-content/plugins/imagina-signatures';

beforeEach(() => setAssetsBaseUrl(BASE));
afterEach(() => setAssetsBaseUrl(null));

function social(overrides: Partial<SocialIconsBlock> = {}): SocialIconsBlock {
  return {
    id: 'soc',
    type: 'social_icons',
    items: [
      { id: 'a', network: 'linkedin', url: 'https://linkedin.com/in/jane' },
      { id: 'b', network: 'github', url: 'https://github.com/jane' },
      { id: 'c', network: 'x', url: 'https://x.com/jane' },
    ],
    shape: 'circle',
    tone: 'brand',
    size: 24,
    spacing: 8,
    align: 'left',
    ...overrides,
  };
}

function compile(block: SocialIconsBlock) {
  const schema = createEmptySchema();
  schema.blocks = [block];
  const result = compileSignature(schema);
  const doc = new DOMParser().parseFromString(result.fragment, 'text/html');
  return { ...result, doc };
}

describe('social icons compile', () => {
  it('emits one linked hosted PNG per network with width, height and alt', () => {
    const { doc, errors } = compile(social());
    const imgs = Array.from(doc.querySelectorAll('img'));
    expect(imgs).toHaveLength(3);
    expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(['LinkedIn', 'GitHub', 'X']);
    for (const img of imgs) {
      expect(img.getAttribute('width')).toBe('24');
      expect(img.getAttribute('height')).toBe('24');
      expect(img.getAttribute('style')).toContain('display:block');
      expect(img.getAttribute('style')).toContain('border:0');
      expect(img.parentElement?.tagName).toBe('A');
    }
    expect(imgs[0]!.getAttribute('src')).toBe(`${BASE}/assets/icons/circle-brand/linkedin.png`);
    expect(Array.from(doc.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'https://linkedin.com/in/jane',
      'https://github.com/jane',
      'https://x.com/jane',
    ]);
    expect(errors).toEqual([]);
  });

  it('no longer draws letter circles', () => {
    const { doc, fragment } = compile(social());
    expect(doc.querySelectorAll('span')).toHaveLength(0);
    expect(fragment).not.toMatch(/border-radius:50%/);
    // No visible text at all — the icons carry the meaning (alt text).
    const text = Array.from(doc.querySelectorAll('td'))
      .map((td) => td.textContent ?? '')
      .join('')
      .trim();
    expect(text).toBe('');
  });

  it('uses the chosen shape / tone folder and size', () => {
    const { doc } = compile(social({ shape: 'plain', tone: 'gray', size: 32 }));
    const img = doc.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`${BASE}/assets/icons/plain-gray/linkedin.png`);
    expect(img.getAttribute('width')).toBe('32');
  });

  it('clamps size to 16–40 and spacing to 0–24', () => {
    const { doc } = compile(social({ size: 400, spacing: 99 }));
    const cells = Array.from(doc.querySelectorAll('img')).map((i) => i.closest('td')!);
    expect(doc.querySelector('img')!.getAttribute('width')).toBe('40');
    expect(cells[0]!.getAttribute('style')).toContain('padding:0 24px 0 0');
    expect(cells[2]!.getAttribute('style')).toContain('padding:0;');
  });

  it('aligns with the table align attribute inside a full-width wrapper', () => {
    for (const align of ['center', 'right'] as const) {
      const { doc } = compile(social({ align }));
      const inner = doc.querySelector('img')!.closest('table')!;
      expect(inner.getAttribute('align')).toBe(align);
      expect(inner.parentElement?.closest('td')?.getAttribute('align')).toBe(align);
    }
    const { doc } = compile(social({ align: 'left' }));
    expect(doc.querySelector('img')!.closest('table')!.hasAttribute('align')).toBe(false);
  });

  it('escapes hrefs and neutralises unsafe ones', () => {
    const { doc, fragment, errors } = compile(
      social({
        items: [
          { id: 'a', network: 'linkedin', url: 'https://x.example/?a=1&b="2"<script>' },
          { id: 'b', network: 'website', url: 'javascript:alert(1)' },
        ],
      }),
    );
    expect(fragment).not.toContain('<script>');
    expect(fragment).not.toContain('javascript:');
    const hrefs = Array.from(doc.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs[0]).toBe('https://x.example/?a=1&b="2"<script>');
    expect(hrefs[1]).toBe('#');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('skips items without a URL and warns', () => {
    const { doc, issues } = compile(
      social({
        items: [
          { id: 'a', network: 'linkedin', url: '' },
          { id: 'b', network: 'instagram', url: 'https://' },
          { id: 'c', network: 'github', url: 'https://github.com/jane' },
        ],
      }),
    );
    expect(doc.querySelectorAll('img')).toHaveLength(1);
    const warnings = issues.filter((i) => i.code === 'social-missing-url');
    expect(warnings).toHaveLength(2);
    expect(warnings[0]!.blockId).toBe('soc');
  });

  it('emits nothing when no item has a URL', () => {
    const { doc } = compile(social({ items: [{ id: 'a', network: 'x', url: '' }] }));
    expect(doc.querySelectorAll('img')).toHaveLength(0);
  });

  it('warns when the row is wider than the space available', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      network: 'linkedin',
      url: 'https://linkedin.com/in/x',
    }));
    const { issues } = compile(social({ items, size: 40, spacing: 24 }));
    expect(issues.some((i) => i.code === 'social-too-wide')).toBe(true);
  });

  it('applies the block padding on the wrapper cell', () => {
    const { doc } = compile(social({ padding: { top: 4, right: 0, bottom: 8, left: 2 } }));
    const wrapper = doc.querySelector('img')!.closest('table')!.parentElement!.closest('td')!;
    expect(wrapper.getAttribute('style')).toContain('padding:4px 0px 8px 2px');
  });
});

describe('social hrefs', () => {
  it('completes bare addresses per network', () => {
    expect(socialHref('email', 'jane@acme.example')).toBe('mailto:jane@acme.example');
    expect(socialHref('email', 'mailto:jane@acme.example')).toBe('mailto:jane@acme.example');
    expect(socialHref('whatsapp', '+1 (555) 100-2000')).toBe('https://wa.me/15551002000');
    expect(socialHref('website', 'acme.example')).toBe('https://acme.example');
    expect(socialHref('website', '//acme.example')).toBe('https://acme.example');
    expect(socialHref('linkedin', 'https://linkedin.com/in/jane')).toBe(
      'https://linkedin.com/in/jane',
    );
    expect(socialHref('linkedin', '{{linkedin}}')).toBe('{{linkedin}}');
  });

  it('treats empty and scheme-only URLs as missing', () => {
    expect(socialHref('x', '')).toBe('');
    expect(socialHref('x', '  https://  ')).toBe('');
    expect(socialHref('x', 'http:')).toBe('');
  });
});

describe('social v1 → v2 normaliser', () => {
  const v1: SocialIconsBlock = {
    id: 'old',
    type: 'social_icons',
    networks: [
      { platform: 'linkedin', url: 'https://linkedin.com/in/jane' },
      { platform: 'twitter', url: 'https://twitter.com/jane' },
      { platform: 'myspace', url: 'https://myspace.com/jane' },
    ],
    icon_size: 48,
    gap: 6,
    color: '#1d4ed8',
  };

  it('converts networks, size, gap and colour', () => {
    const n = normalizeSocialIcons(v1);
    expect(n.items).toEqual([
      { id: 'old-0', network: 'linkedin', url: 'https://linkedin.com/in/jane' },
      { id: 'old-1', network: 'x', url: 'https://twitter.com/jane' },
      { id: 'old-2', network: 'website', url: 'https://myspace.com/jane' },
    ]);
    expect(n.shape).toBe('circle');
    expect(n.tone).toBe('brand');
    expect(n.size).toBe(40);
    expect(n.spacing).toBe(6);
    expect(n.align).toBe('left');
  });

  it('maps neutral v1 colours to dark / gray / light tones', () => {
    expect(toneFromColor('#111827')).toBe('dark');
    expect(toneFromColor('#374151')).toBe('dark');
    expect(toneFromColor('#6b7280')).toBe('gray');
    expect(toneFromColor('#ffffff')).toBe('light');
    expect(toneFromColor('#ec4899')).toBe('brand');
    expect(toneFromColor('rgb(13, 148, 136)')).toBe('brand');
    expect(toneFromColor('nonsense')).toBe('brand');
  });

  it('compiles a v1 block to hosted icons', () => {
    const { doc } = compile(v1);
    expect(Array.from(doc.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual([
      `${BASE}/assets/icons/circle-brand/linkedin.png`,
      `${BASE}/assets/icons/circle-brand/x.png`,
      `${BASE}/assets/icons/circle-brand/website.png`,
    ]);
  });

  it('rewrites v1 as v2 on the first edit and drops the v1 keys', () => {
    const patch = toV2Patch(normalizeSocialIcons(v1));
    const stored = JSON.parse(JSON.stringify({ ...v1, ...patch })) as SocialIconsBlock;
    expect(stored.networks).toBeUndefined();
    expect(stored.icon_size).toBeUndefined();
    expect(stored.gap).toBeUndefined();
    expect(stored.color).toBeUndefined();
    expect(stored.items).toHaveLength(3);
    expect(normalizeSocialIcons(stored)).toEqual(normalizeSocialIcons(v1));
  });

  it('keeps unknown v2 networks renderable', () => {
    expect(normalizeNetwork('LinkedIn')).toBe('linkedin');
    expect(normalizeNetwork('../../etc')).toBe('website');
    expect(normalizeNetwork(undefined)).toBe('website');
  });
});
