import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzeDarkOnTransparent,
  analyzeImageUrl,
  clearDarkImageCache,
  darkImageCandidates,
  isLightColor,
  lightBoxFor,
  type PixelData,
} from '@/editor/modals/preview/darkImages';
import { addLightBackground } from '@/editor/modals/preview/useDarkImageRisks';
import { useSchemaStore } from '@/stores/schemaStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { ContainerBlock, ImageBlock } from '@/core/schema/blocks';
import { compileSignature } from '@/core/compiler/compile';
import '@/core/blocks';

type Px = [number, number, number, number];

/** Synthetic ImageData: `fill(x, y)` returns RGBA for each pixel. */
function image(width: number, height: number, fill: (x: number, y: number) => Px): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(fill(x, y), (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const TRANSPARENT: Px = [0, 0, 0, 0];
const insideLogo = (x: number, y: number) => x >= 5 && x < 15 && y >= 5 && y < 15;

afterEach(() => {
  clearDarkImageCache();
});

describe('analyzeDarkOnTransparent', () => {
  it('flags a dark logo on a transparent background', () => {
    const r = analyzeDarkOnTransparent(
      image(20, 20, (x, y) => (insideLogo(x, y) ? [17, 24, 39, 255] : TRANSPARENT)),
    );
    expect(r.transparentRatio).toBeCloseTo(0.75, 2);
    expect(r.darkRatio).toBe(1);
    expect(r.risky).toBe(true);
  });

  it('ignores opaque images (photos, logos on white)', () => {
    const r = analyzeDarkOnTransparent(
      image(20, 20, (x, y) => (insideLogo(x, y) ? [0, 0, 0, 255] : [255, 255, 255, 255])),
    );
    expect(r.transparentRatio).toBe(0);
    expect(r.risky).toBe(false);
  });

  it('ignores light or colourful logos on transparent backgrounds', () => {
    expect(
      analyzeDarkOnTransparent(
        image(20, 20, (x, y) => (insideLogo(x, y) ? [255, 255, 255, 255] : TRANSPARENT)),
      ).risky,
    ).toBe(false);
    expect(
      analyzeDarkOnTransparent(
        image(20, 20, (x, y) => (insideLogo(x, y) ? [249, 115, 22, 255] : TRANSPARENT)),
      ).risky,
    ).toBe(false);
  });

  it('needs MOSTLY dark pixels: a half-light logo is fine', () => {
    const r = analyzeDarkOnTransparent(
      image(20, 20, (x, y) =>
        insideLogo(x, y) ? (x < 10 ? [0, 0, 0, 255] : [240, 240, 240, 255]) : TRANSPARENT,
      ),
    );
    expect(r.darkRatio).toBeCloseTo(0.5, 2);
    expect(r.risky).toBe(false);
  });

  it('ignores anti-aliased edges and empty images', () => {
    const edges = analyzeDarkOnTransparent(
      image(20, 20, (x, y) => (insideLogo(x, y) ? [0, 0, 0, 255] : [0, 0, 0, 60])),
    );
    // Half-transparent pixels count neither as transparent nor as visible.
    expect(edges.transparentRatio).toBe(0);
    expect(edges.risky).toBe(false);
    expect(analyzeDarkOnTransparent(image(4, 4, () => TRANSPARENT)).risky).toBe(false);
  });
});

describe('loading', () => {
  it('resolves null silently when the image cannot be read, and caches per URL', async () => {
    const OriginalImage = globalThis.Image;
    let created = 0;
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin: string | null = null;
      decoding = 'auto';
      constructor() {
        created++;
      }
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    globalThis.Image = FailingImage as unknown as typeof Image;
    try {
      await expect(analyzeImageUrl('https://cdn.example/logo.png')).resolves.toBeNull();
      await expect(analyzeImageUrl('https://cdn.example/logo.png')).resolves.toBeNull();
      expect(created).toBe(1);
    } finally {
      globalThis.Image = OriginalImage;
    }
  });
});

describe('candidates and fix', () => {
  const logo: ImageBlock = {
    id: 'logo',
    type: 'image',
    src: 'https://cdn.example/logo.png',
    alt: 'ACME',
    width: 120,
  };

  it('lists compiled images per block, skipping blocks that already have a light box', () => {
    const schema = createEmptySchema();
    const boxed: ImageBlock = {
      ...logo,
      id: 'boxed',
      src: 'https://cdn.example/b.png',
      box: { background_color: '#ffffff' },
    };
    const row: ContainerBlock = {
      id: 'row',
      type: 'container',
      gap: 16,
      columns: [
        { id: 'c1', width: 50, children: [logo] },
        { id: 'c2', width: 50, children: [boxed] },
      ],
    };
    schema.blocks = [row];
    const { images } = compileSignature(schema);
    expect(darkImageCandidates(images, schema.blocks)).toEqual([
      { blockId: 'logo', blockType: 'image', src: 'https://cdn.example/logo.png', alt: 'ACME' },
    ]);
  });

  it('knows light colours', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#f8fafc')).toBe(true);
    expect(isLightColor('#64748b')).toBe(false);
    expect(isLightColor('rgba(255,255,255,0.2)')).toBe(false);
    expect(isLightColor(undefined)).toBe(false);
  });

  it('lightBoxFor sets white, 4px padding and 4px radius, keeping other box settings', () => {
    expect(lightBoxFor(undefined)).toEqual({
      background_color: '#ffffff',
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
      border_radius: 4,
    });
    expect(
      lightBoxFor({
        background_color: '#000000',
        align: 'center',
        width: 200,
        padding: { top: 8, right: 8, bottom: 8, left: 8 },
        border_radius: 10,
      }),
    ).toEqual({
      background_color: '#ffffff',
      align: 'center',
      width: 200,
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      border_radius: 10,
    });
  });

  it('addLightBackground patches the block through updateBlock (nested blocks too)', () => {
    const schema = createEmptySchema();
    schema.blocks = [
      {
        id: 'row',
        type: 'container',
        gap: 16,
        columns: [{ id: 'c1', width: 100, children: [logo] }],
      } as ContainerBlock,
    ];
    useSchemaStore.setState({ schema });
    addLightBackground('logo');
    const updated = (useSchemaStore.getState().schema.blocks[0] as ContainerBlock).columns[0]!
      .children[0] as ImageBlock;
    expect(updated.box).toEqual({
      background_color: '#ffffff',
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
      border_radius: 4,
    });
    // The compiled signature now paints the light box around the logo.
    const { html } = compileSignature(useSchemaStore.getState().schema);
    expect(html).toMatch(
      /<td bgcolor="#ffffff"[^>]*style="background-color:#ffffff;border-radius:4px;padding:4px 4px 4px 4px"/,
    );
  });
});
