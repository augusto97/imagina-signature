import { describe, expect, it } from 'vitest';
import { banner, cellOf, compile, expectCleanStyles, only, row } from './image-block-helpers';

/**
 * Banner block email output: fixed vs full width, alignment, aspect height, radius, link, alt.
 */

describe('banner block', () => {
  it('keeps a pre-1.2 fixed width, centred', () => {
    const { html } = compile([banner()]);
    const img = only(html);
    expect(img.getAttribute('width')).toBe('400');
    expect(cellOf(img).getAttribute('align')).toBe('center');
    expect(img.getAttribute('style')).toContain('margin:0 auto');
    expectCleanStyles(html);
  });

  it('fills the available width when full width (minus padding)', () => {
    const { html } = compile([
      banner({ full_width: true, padding: { top: 0, right: 10, bottom: 0, left: 10 } }),
    ]);
    expect(only(html).getAttribute('width')).toBe('580');
  });

  it('fills a container cell when full width', () => {
    const { html } = compile([row([], [banner({ full_width: true })])]);
    expect(only(html).getAttribute('width')).toBe('290');
  });

  it('treats width 0 as full width', () => {
    expect(only(compile([banner({ width: 0 })]).html).getAttribute('width')).toBe('600');
  });

  it('emits the height from the intrinsic aspect', () => {
    const img = only(
      compile([banner({ full_width: true, natural_width: 1200, natural_height: 300 })]).html,
    );
    expect(img.getAttribute('width')).toBe('600');
    expect(img.getAttribute('height')).toBe('150');
  });

  it('aligns, rounds and links a fixed-width banner', () => {
    const { html } = compile([
      banner({ align: 'right', border_radius: 12, link: 'https://shop.example/sale' }),
    ]);
    const a = only(html, 'a');
    expect(a.getAttribute('href')).toBe('https://shop.example/sale');
    const img = a.querySelector('img')!;
    expect(cellOf(img).getAttribute('align')).toBe('right');
    expect(img.getAttribute('style')).toContain('border-radius:12px');
    expect(img.getAttribute('style')).toContain('margin:0 0 0 auto');
  });

  it('warns about a missing alt text', () => {
    const result = compile([banner({ alt: '' })]);
    expect(result.issues.find((i) => i.code === 'missing-alt')?.blockId).toBe('ban');
  });
});
