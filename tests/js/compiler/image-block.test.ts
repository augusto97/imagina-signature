import { describe, expect, it } from 'vitest';
import type { ImageBlock } from '@/core/schema/blocks';
import { isLowResolution } from '@/core/blocks/image/model';
import { cellOf, compile, expectCleanStyles, image, NO_PAD, only, row } from './image-block-helpers';

/**
 * Image block email output (1.2 fields and pre-1.2 rows).
 */

describe('image block', () => {
  it('emits width / height / alt and the email-safe base style', () => {
    const { html, issues } = compile([image({ height: 80 })]);
    const img = only(html);
    expect(img.getAttribute('width')).toBe('200');
    expect(img.getAttribute('height')).toBe('80');
    expect(img.getAttribute('alt')).toBe('Acme logo');
    const style = img.getAttribute('style')!;
    for (const decl of ['display:block', 'border:0', 'outline:none', 'max-width:100%', 'height:auto']) {
      expect(style).toContain(decl);
    }
    expect(issues.filter((i) => i.blockId === 'img')).toEqual([]);
    expectCleanStyles(html);
  });

  it('defaults to left alignment (pre-1.2 rows) on a full-width cell', () => {
    const img = only(compile([image()]).html);
    const td = cellOf(img);
    expect(td.getAttribute('align')).toBe('left');
    expect(td.getAttribute('style')).toContain('text-align:left');
    expect(td.closest('table')!.getAttribute('width')).toBe('100%');
    expect(img.getAttribute('style')).not.toContain('margin');
  });

  it.each([
    ['center', 'margin:0 auto'],
    ['right', 'margin:0 0 0 auto'],
  ] as const)('aligns %s via the cell and the image margin', (align, margin) => {
    const img = only(compile([image({ align })]).html);
    expect(cellOf(img).getAttribute('align')).toBe(align);
    expect(cellOf(img).getAttribute('style')).toContain(`text-align:${align}`);
    expect(img.getAttribute('style')).toContain(margin);
  });

  it('ignores an unknown alignment value', () => {
    const img = only(compile([image({ align: 'evil" onload="x' as never })]).html);
    expect(cellOf(img).getAttribute('align')).toBe('left');
  });

  it('derives the height from the intrinsic aspect when locked', () => {
    const img = only(
      compile([image({ height: 150, natural_width: 800, natural_height: 400 })]).html,
    );
    expect(img.getAttribute('height')).toBe('100');
  });

  it('keeps an explicit height when the aspect is unlocked', () => {
    const img = only(
      compile([
        image({ height: 50, lock_aspect: false, natural_width: 800, natural_height: 400 }),
      ]).html,
    );
    expect(img.getAttribute('width')).toBe('200');
    expect(img.getAttribute('height')).toBe('50');
  });

  it('omits the height when nothing tells it (clients derive it)', () => {
    const img = only(compile([image()]).html);
    expect(img.hasAttribute('height')).toBe(false);
  });

  it('clamps to the available width, keeping the aspect, with a warning', () => {
    const result = compile([image({ width: 900, natural_width: 1800, natural_height: 600 })]);
    const img = only(result.html);
    expect(img.getAttribute('width')).toBe('600');
    expect(img.getAttribute('height')).toBe('200');
    expect(result.issues.find((i) => i.code === 'image-too-wide')?.blockId).toBe('img');
  });

  it('clamps inside a container cell', () => {
    const { html } = compile([row([image({ width: 400 })], [])]);
    // 50% of 600 = 300 outer, minus half the 20px gap = 290.
    expect(only(html).getAttribute('width')).toBe('290');
  });

  it('uses the intrinsic size when no width is set, silently capped', () => {
    const small = only(
      compile([image({ width: undefined, natural_width: 300, natural_height: 100 })]).html,
    );
    expect(small.getAttribute('width')).toBe('300');
    expect(small.getAttribute('height')).toBe('100');

    const result = compile([image({ width: undefined, natural_width: 1200, natural_height: 400 })]);
    expect(only(result.html).getAttribute('width')).toBe('600');
    expect(only(result.html).getAttribute('height')).toBe('200');
    expect(result.issues.some((i) => i.code === 'image-too-wide')).toBe(false);
  });

  it('wraps the image in its link', () => {
    const { html } = compile([image({ link: 'https://acme.example' })]);
    const a = only(html, 'a');
    expect(a.getAttribute('href')).toBe('https://acme.example');
    expect(a.querySelector('img')).not.toBeNull();
  });

  it('applies radius and a validated border, reserving the border in the clamp', () => {
    const { html } = compile([
      image({
        width: 600,
        border_radius: 8,
        border: { width: 2, style: 'dashed', color: '#FF0000' },
      }),
    ]);
    const img = only(html);
    const style = img.getAttribute('style')!;
    expect(style).toContain('border-radius:8px');
    expect(style).toContain('border:2px dashed #ff0000');
    expect(style).not.toContain('border:0');
    expect(img.getAttribute('width')).toBe('596');
    expectCleanStyles(html);
  });

  it('neutralises hostile border values', () => {
    const { html } = compile([
      image({
        border: { width: 3, style: 'groove;x:y' as never, color: 'red;background:url(x)' },
      }),
    ]);
    const style = only(html).getAttribute('style')!;
    expect(style).toContain('border:3px solid #e5e7eb');
    expectCleanStyles(html);
  });

  it('treats a zero-width border as none', () => {
    const style = only(
      compile([image({ border: { width: 0, style: 'solid', color: '#000000' } })]).html,
    ).getAttribute('style')!;
    expect(style).toContain('border:0');
  });

  it('warns when the alt text is missing', () => {
    const result = compile([image({ alt: '  ' })]);
    expect(result.issues.find((i) => i.code === 'missing-alt')?.blockId).toBe('img');
  });

  it('keeps the Outlook static fallback for GIFs', () => {
    const { html } = compile([
      image({
        src: 'https://cdn.example.com/anim.gif',
        static_fallback_url: 'https://cdn.example.com/still.png',
      }),
    ]);
    expect(html).toContain('<!--[if mso]>');
    expect(html).toContain('https://cdn.example.com/still.png');
  });

  it('compiles a pre-1.2 row like before (120×120, radius 8)', () => {
    const legacy = {
      id: 'logo',
      type: 'image',
      src: 'https://cdn.example.com/l.png',
      alt: 'Company logo',
      width: 120,
      height: 120,
      border_radius: 8,
      padding: NO_PAD,
    } as ImageBlock;
    const img = only(compile([legacy]).html);
    expect(img.getAttribute('width')).toBe('120');
    expect(img.getAttribute('height')).toBe('120');
    expect(img.getAttribute('style')).toContain('border-radius:8px');
  });
});

describe('resolution hint', () => {
  it('flags images with fewer than 2× (cap 1200) the display pixels', () => {
    expect(isLowResolution({ width: 300, height: 100 }, 200)).toBe(true);
    expect(isLowResolution({ width: 400, height: 100 }, 200)).toBe(false);
    // 2× of 700 is above the 1200 px upload cap — 1200 is enough.
    expect(isLowResolution({ width: 1200, height: 400 }, 700)).toBe(false);
    expect(isLowResolution(null, 200)).toBe(false);
  });
});
