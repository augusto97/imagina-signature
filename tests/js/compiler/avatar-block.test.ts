import { describe, expect, it } from 'vitest';
import { desiredSpec, needsProcessing, resolveAvatar, sameSpec } from '@/core/blocks/avatar/model';
import { avatar, cellOf, compile, expectCleanStyles, only, parse, row } from './image-block-helpers';

/**
 * Avatar block email output: shapes, CSS vs baked ring, alignment, link, clamping, and when the hosted PNG must be re-rendered.
 */

describe('avatar block', () => {
  it('renders a pre-1.2 row as a CSS circle of `size`', () => {
    const { html } = compile([avatar()]);
    const img = only(html);
    expect(img.getAttribute('width')).toBe('80');
    expect(img.getAttribute('height')).toBe('80');
    expect(img.getAttribute('alt')).toBe('Jane Doe');
    expect(img.getAttribute('style')).toContain('border-radius:50%');
    expect(cellOf(img).getAttribute('align')).toBe('left');
    expectCleanStyles(html);
  });

  it('rounds or squares the corners per shape', () => {
    expect(only(compile([avatar({ shape: 'rounded' })]).html).getAttribute('style')).toContain(
      'border-radius:16px',
    );
    expect(only(compile([avatar({ shape: 'square' })]).html).getAttribute('style')).not.toContain(
      'border-radius',
    );
  });

  it('draws a ring that is not baked in as a padded coloured cell', () => {
    const { html } = compile([avatar({ ring_width: 3, ring_color: '#2563EB' })]);
    const img = only(html);
    expect(img.getAttribute('width')).toBe('74');
    expect(img.getAttribute('height')).toBe('74');
    const ring = cellOf(img);
    expect(ring.getAttribute('bgcolor')).toBe('#2563eb');
    const style = ring.getAttribute('style')!;
    expect(style).toContain('padding:3px');
    expect(style).toContain('background-color:#2563eb');
    expect(style).toContain('border-radius:50%');
    expectCleanStyles(html);
  });

  it('emits only the image when the ring is baked into the PNG', () => {
    const spec = {
      source_url: 'https://cdn.example.com/me.jpg',
      shape: 'circle' as const,
      ring_width: 3,
      ring_color: '#2563eb',
      size: 80,
    };
    const { html } = compile([
      avatar({
        src: 'https://cdn.example.com/me-ring.png',
        source_url: spec.source_url,
        ring_width: 3,
        ring_color: '#2563eb',
        processed: spec,
      }),
    ]);
    const img = only(html);
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/me-ring.png');
    expect(img.getAttribute('width')).toBe('80');
    expect(parse(html).querySelector('td[bgcolor="#2563eb"]')).toBeNull();
  });

  it('links and aligns the avatar', () => {
    const { html } = compile([avatar({ link: 'https://jane.example', align: 'center' })]);
    const a = only(html, 'a');
    expect(a.getAttribute('href')).toBe('https://jane.example');
    const img = a.querySelector('img')!;
    expect(cellOf(img).getAttribute('align')).toBe('center');
    expect(img.getAttribute('style')).toContain('margin:0 auto');
  });

  it('clamps to the column and keeps it square', () => {
    const { html } = compile([row([avatar({ size: 400 })], [])]);
    const img = only(html);
    expect(img.getAttribute('width')).toBe('290');
    expect(img.getAttribute('height')).toBe('290');
  });

  it('tracks whether the hosted PNG matches the settings', () => {
    const fresh = resolveAvatar(avatar());
    expect(needsProcessing(fresh)).toBe(false); // pasted / legacy: used as-is

    const uploaded = resolveAvatar(avatar({ source_url: 'https://cdn.example.com/me.jpg' }));
    expect(needsProcessing(uploaded)).toBe(true);

    const spec = desiredSpec(uploaded)!;
    const done = resolveAvatar(
      avatar({ source_url: spec.source_url, processed: spec, src: 'https://cdn.example.com/m.png' }),
    );
    expect(needsProcessing(done)).toBe(false);

    expect(needsProcessing({ ...done, shape: 'rounded' })).toBe(true);
    expect(needsProcessing({ ...done, size: 96 })).toBe(true);
    // Ring colour only matters with a ring.
    expect(sameSpec({ ...spec, ring_color: '#000000' }, spec)).toBe(true);
    expect(sameSpec({ ...spec, ring_width: 2, ring_color: '#000000' }, { ...spec, ring_width: 2 })).toBe(
      false,
    );
  });
});
