import { expect } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { AvatarBlock, BannerBlock, Block, ContainerBlock, ImageBlock } from '@/core/schema/blocks';
import '@/core/blocks';

/**
 * Shared fixtures for the Image / Avatar / Banner compile tests: the
 * output is inspected with DOMParser like a mail client would.
 */

export function compile(blocks: Block[], width = 600) {
  const schema = createEmptySchema();
  schema.canvas.width = width;
  schema.blocks = blocks;
  return compileSignature(schema);
}

export function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function only(html: string, selector = 'img'): HTMLElement {
  const els = parse(html).body.querySelectorAll(selector);
  expect(els.length).toBe(1);
  return els[0] as HTMLElement;
}

/** The `<td>` wrapping the block (direct parent of the img / link / ring table). */
export function cellOf(el: Element): HTMLTableCellElement {
  return el.closest('td') as HTMLTableCellElement;
}

const DECLARATION = /^-?[a-z][a-z-]*:[^;"<>{}]+$/;

export function expectCleanStyles(html: string): void {
  for (const el of Array.from(parse(html).querySelectorAll('[style]'))) {
    for (const decl of (el.getAttribute('style') ?? '').split(';').filter((d) => d.trim())) {
      expect(DECLARATION.test(decl.trim()), decl).toBe(true);
    }
  }
}

export const NO_PAD = { top: 0, right: 0, bottom: 0, left: 0 };

export const image = (extra: Partial<ImageBlock> = {}): ImageBlock => ({
  id: 'img',
  type: 'image',
  src: 'https://cdn.example.com/logo.png',
  alt: 'Acme logo',
  width: 200,
  padding: NO_PAD,
  ...extra,
});

export const avatar = (extra: Partial<AvatarBlock> = {}): AvatarBlock => ({
  id: 'av',
  type: 'avatar',
  src: 'https://cdn.example.com/me.jpg',
  alt: 'Jane Doe',
  size: 80,
  padding: NO_PAD,
  ...extra,
});

export const banner = (extra: Partial<BannerBlock> = {}): BannerBlock => ({
  id: 'ban',
  type: 'banner',
  src: 'https://cdn.example.com/promo.png',
  alt: 'Spring sale',
  link: '',
  width: 400,
  padding: NO_PAD,
  ...extra,
});

export const row = (left: Block[], right: Block[]): ContainerBlock => ({
  id: 'row',
  type: 'container',
  gap: 20,
  columns: [
    { id: 'row-l', width: 50, children: left },
    { id: 'row-r', width: 50, children: right },
  ],
});
