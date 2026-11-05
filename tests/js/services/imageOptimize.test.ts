import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Upload optimiser: the pure decisions (format / size / keep-original)
 * and the canvas pipeline with a mocked canvas + decoder (jsdom has
 * neither a 2D context nor image decoding).
 */

const decode = vi.hoisted(() => ({
  image: { naturalWidth: 3000, naturalHeight: 2000, width: 3000, height: 2000 },
}));

vi.mock('@/services/imageDecode', () => ({
  decodeImageBlob: vi.fn(async () => decode.image),
  loadImageForCanvas: vi.fn(async () => decode.image),
  probeImageSize: vi.fn(async () => null),
}));

import {
  candidateMimes,
  decideSource,
  gifWarnings,
  GIF_WARN_BYTES,
  JPEG_QUALITY,
  keepOriginalBytes,
  optimizeAndUpload,
  optimizeImageElement,
  optimizeImageFile,
  outputSize,
  readGifSize,
  shapeRadius,
  type DecodedImage,
} from '@/services/imageOptimize';
import { UploadError, UploadsDisabledError } from '@/services/uploads';

const config = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
  .IMGSIG_EDITOR_CONFIG;

// ---------------------------------------------------------------------------
// Canvas mock
// ---------------------------------------------------------------------------

interface FakeCanvas {
  width: number;
  height: number;
  ops: string[];
  fills: string[];
}

let canvases: FakeCanvas[] = [];
let encoded: Array<{ mime: string; quality: number | undefined; width: number; height: number }> = [];
let options: { alpha: boolean; sizes: Record<string, number> };

function installCanvas(): void {
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return realCreate(tag);
    const canvas: FakeCanvas & Record<string, unknown> = { width: 0, height: 0, ops: [], fills: [] };
    const ctx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillStyle: '',
      drawImage: () => canvas.ops.push('drawImage'),
      getImageData: () => ({
        data: new Uint8ClampedArray([255, 255, 255, options.alpha ? 0 : 255]),
      }),
      save: () => canvas.ops.push('save'),
      restore: () => canvas.ops.push('restore'),
      beginPath: () => canvas.ops.push('beginPath'),
      rect: () => canvas.ops.push('rect'),
      moveTo: () => canvas.ops.push('moveTo'),
      arcTo: () => canvas.ops.push('arcTo'),
      closePath: () => canvas.ops.push('closePath'),
      clip: () => canvas.ops.push('clip'),
      fill: () => canvas.fills.push(ctx.fillStyle),
    };
    canvas.getContext = () => ctx;
    canvas.toBlob = (cb: (b: Blob | null) => void, mime: string, quality?: number) => {
      encoded.push({ mime, quality, width: canvas.width, height: canvas.height });
      cb(new Blob([new Uint8Array(options.sizes[mime] ?? 100)], { type: mime }));
    };
    canvases.push(canvas);
    return canvas as unknown as HTMLElement;
  }) as typeof document.createElement);
}

beforeEach(() => {
  canvases = [];
  encoded = [];
  options = { alpha: false, sizes: { 'image/jpeg': 1000, 'image/png': 3000 } };
  decode.image = { naturalWidth: 3000, naturalHeight: 2000, width: 3000, height: 2000 };
  installCanvas();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete config.uploadEnabled;
});

const file = (type: string, bytes: number, name = 'photo'): File =>
  new File([new Uint8Array(bytes)], name, { type });

/** Last canvas created = the output canvas (step-down canvases come first). */
const output = (): FakeCanvas => canvases[canvases.length - 1]!;

// ---------------------------------------------------------------------------
// Pure decisions
// ---------------------------------------------------------------------------

describe('decideSource', () => {
  it('rejects SVG and unsupported types with a message', () => {
    expect(decideSource('image/svg+xml', false)).toMatchObject({ action: 'reject' });
    expect(decideSource('image/bmp', false)).toMatchObject({ action: 'reject' });
    expect(decideSource('application/pdf', false)).toMatchObject({ action: 'reject' });
  });

  it('passes GIFs through untouched unless a crop / mask is requested', () => {
    expect(decideSource('image/gif', false)).toEqual({ action: 'passthrough' });
    expect(decideSource('IMAGE/GIF', true)).toEqual({ action: 'render' });
  });

  it('renders PNG / JPEG / WebP and unknown types', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp', '']) {
      expect(decideSource(mime, false)).toEqual({ action: 'render' });
    }
  });
});

describe('outputSize', () => {
  it('targets 2× the display width', () => {
    expect(outputSize(3000, 2000, 300)).toEqual({ width: 600, height: 400, resized: true });
  });

  it('caps at 1200 px', () => {
    expect(outputSize(4000, 1000, 900)).toEqual({ width: 1200, height: 300, resized: true });
  });

  it('never upscales', () => {
    expect(outputSize(400, 300, 300)).toEqual({ width: 400, height: 300, resized: false });
  });
});

describe('candidateMimes', () => {
  it.each([
    [{ sourceMime: 'image/jpeg', hasAlpha: false, masked: false }, ['image/jpeg']],
    [{ sourceMime: 'image/webp', hasAlpha: false, masked: false }, ['image/jpeg']],
    [{ sourceMime: 'image/png', hasAlpha: false, masked: false }, ['image/jpeg', 'image/png']],
    [{ sourceMime: 'image/png', hasAlpha: true, masked: false }, ['image/png']],
    [{ sourceMime: 'image/webp', hasAlpha: true, masked: false }, ['image/png']],
    [{ sourceMime: 'image/jpeg', hasAlpha: false, masked: true }, ['image/png']],
  ])('%o → %o', (input, expected) => {
    expect(candidateMimes(input)).toEqual(expected);
  });
});

describe('keepOriginalBytes', () => {
  it('keeps an untouched JPEG / PNG that is already smaller', () => {
    expect(
      keepOriginalBytes({ sourceMime: 'image/jpeg', sourceBytes: 800, outputBytes: 1000, pixelsChanged: false }),
    ).toBe(true);
    expect(
      keepOriginalBytes({ sourceMime: 'image/png', sourceBytes: 1000, outputBytes: 1000, pixelsChanged: false }),
    ).toBe(true);
  });

  it('re-encodes when pixels changed, the re-encode is smaller, or the source is WebP', () => {
    expect(
      keepOriginalBytes({ sourceMime: 'image/jpeg', sourceBytes: 800, outputBytes: 1000, pixelsChanged: true }),
    ).toBe(false);
    expect(
      keepOriginalBytes({ sourceMime: 'image/jpeg', sourceBytes: 5000, outputBytes: 1000, pixelsChanged: false }),
    ).toBe(false);
    expect(
      keepOriginalBytes({ sourceMime: 'image/webp', sourceBytes: 10, outputBytes: 1000, pixelsChanged: false }),
    ).toBe(false);
  });
});

describe('GIF helpers', () => {
  it('reads the logical screen size from the header', () => {
    const header = new Uint8Array([71, 73, 70, 56, 57, 97, 0x2c, 0x01, 0xc8, 0x00]);
    expect(readGifSize(header)).toEqual({ width: 300, height: 200 });
    expect(readGifSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readGifSize(new Uint8Array([80, 78, 71, 13, 10, 26, 10, 0, 0, 0]))).toBeNull();
  });

  it('warns only above 1 MB', () => {
    expect(gifWarnings(GIF_WARN_BYTES)).toEqual([]);
    const [warning] = gifWarnings(GIF_WARN_BYTES * 2.5);
    expect(warning).toContain('2.5 MB');
  });
});

describe('shapeRadius', () => {
  it('is half the side for a circle, 20% for rounded, 0 for square', () => {
    expect(shapeRadius('circle', 128, 128)).toBe(64);
    expect(shapeRadius('rounded', 128, 128)).toBe(26);
    expect(shapeRadius('square', 128, 128)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Canvas pipeline
// ---------------------------------------------------------------------------

describe('optimizeImageFile', () => {
  it('resizes a large opaque JPEG to 2× display width as JPEG q0.85', async () => {
    const result = await optimizeImageFile(file('image/jpeg', 900_000), { displayWidth: 300 });
    expect(result).toMatchObject({ width: 600, height: 400, mime: 'image/jpeg', reencoded: true });
    expect(encoded).toEqual([{ mime: 'image/jpeg', quality: JPEG_QUALITY, width: 600, height: 400 }]);
    expect(output()).toMatchObject({ width: 600, height: 400 });
  });

  it('keeps PNG when the image has transparency', async () => {
    options.alpha = true;
    const result = await optimizeImageFile(file('image/png', 500_000), { displayWidth: 200 });
    expect(result.mime).toBe('image/png');
    expect(encoded.map((e) => e.mime)).toEqual(['image/png']);
  });

  it('tries JPEG and PNG for an opaque PNG and keeps the smaller', async () => {
    options.sizes = { 'image/jpeg': 4000, 'image/png': 1500 };
    const logo = await optimizeImageFile(file('image/png', 900_000), { displayWidth: 120 });
    expect(encoded.map((e) => e.mime)).toEqual(['image/jpeg', 'image/png']);
    expect(logo.mime).toBe('image/png');

    encoded = [];
    options.sizes = { 'image/jpeg': 1000, 'image/png': 9000 };
    const photo = await optimizeImageFile(file('image/png', 900_000), { displayWidth: 120 });
    expect(photo.mime).toBe('image/jpeg');
  });

  it('uploads an already small JPEG as-is when re-encoding would not help', async () => {
    decode.image = { naturalWidth: 240, naturalHeight: 120, width: 240, height: 120 };
    const original = file('image/jpeg', 600);
    const result = await optimizeImageFile(original, { displayWidth: 120 });
    expect(result.reencoded).toBe(false);
    expect(result.blob).toBe(original);
    expect(result).toMatchObject({ width: 240, height: 120, mime: 'image/jpeg' });
  });

  it('always converts WebP (Outlook cannot show it)', async () => {
    decode.image = { naturalWidth: 200, naturalHeight: 100, width: 200, height: 100 };
    const result = await optimizeImageFile(file('image/webp', 10), { displayWidth: 120 });
    expect(result.mime).toBe('image/jpeg');
    expect(result.reencoded).toBe(true);
  });

  it('uploads GIFs untouched with their header size, warning above 1 MB', async () => {
    const bytes = new Uint8Array(GIF_WARN_BYTES + 10);
    bytes.set([71, 73, 70, 56, 57, 97, 0x58, 0x02, 0x2c, 0x01]);
    const gif = new File([bytes], 'anim.gif', { type: 'image/gif' });
    const result = await optimizeImageFile(gif, { displayWidth: 300 });
    expect(result.blob).toBe(gif);
    expect(result).toMatchObject({ width: 600, height: 300, mime: 'image/gif', reencoded: false });
    expect(result.warnings).toHaveLength(1);
    expect(encoded).toEqual([]);

    const small = await optimizeImageFile(file('image/gif', 2000), { displayWidth: 300 });
    expect(small.warnings).toEqual([]);
  });

  it('flattens a GIF when a crop / mask is requested', async () => {
    const result = await optimizeImageFile(file('image/gif', 2000), {
      displayWidth: 64,
      mask: { shape: 'circle' },
    });
    expect(result.mime).toBe('image/png');
    expect(result).toMatchObject({ width: 128, height: 128 });
  });

  it('rejects SVG', async () => {
    await expect(
      optimizeImageFile(file('image/svg+xml', 100), { displayWidth: 100 }),
    ).rejects.toBeInstanceOf(UploadError);
  });
});

describe('optimizeImageElement — masks', () => {
  it('bakes a circular mask into a square PNG', async () => {
    const result = await optimizeImageElement(decode.image as unknown as DecodedImage, {
      displayWidth: 64,
      mask: { shape: 'circle' },
    });
    expect(result).toMatchObject({ width: 128, height: 128, mime: 'image/png' });
    expect(output().ops).toContain('arcTo');
    expect(output().ops).toContain('clip');
    expect(output().fills).toEqual([]);
  });

  it('paints the ring in its colour, scaled to the output', async () => {
    await optimizeImageElement(decode.image as unknown as DecodedImage, {
      displayWidth: 64,
      mask: { shape: 'rounded', ringWidth: 3, ringColor: '#FF0000' },
    });
    expect(output().fills).toEqual(['#ff0000']);
  });

  it('falls back to white for an unsafe ring colour', async () => {
    await optimizeImageElement(decode.image as unknown as DecodedImage, {
      displayWidth: 64,
      mask: { shape: 'square', ringWidth: 2, ringColor: 'url(javascript:x)' },
    });
    expect(output().fills).toEqual(['#ffffff']);
    // Square + ring on an opaque photo stays a JPEG.
    expect(encoded.map((e) => e.mime)).toEqual(['image/jpeg']);
  });
});

describe('optimizeAndUpload', () => {
  it('refuses in URL-only mode before doing any work', async () => {
    config.uploadEnabled = false;
    await expect(
      optimizeAndUpload(file('image/jpeg', 100), { displayWidth: 100, filenameBase: 'x' }),
    ).rejects.toBeInstanceOf(UploadsDisabledError);
    expect(canvases).toEqual([]);
  });

  it('uploads the optimised bytes with their pixel size', async () => {
    const API = 'http://localhost/wp-json/imagina-signatures/v1';
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, body: init.body });
        if (url === `${API}/upload/init`) {
          return new Response(JSON.stringify({ method: 'direct', url: `${API}/upload/direct` }));
        }
        return new Response(JSON.stringify({ id: 9, public_url: 'https://cdn.example/a.jpg' }), {
          status: 201,
        });
      }),
    );
    const { asset, image } = await optimizeAndUpload(file('image/jpeg', 900_000), {
      displayWidth: 300,
      filenameBase: 'logo',
    });
    expect(asset).toEqual({ id: 9, url: 'https://cdn.example/a.jpg' });
    expect(image).toMatchObject({ width: 600, height: 400 });
    const init = JSON.parse(String(calls[0]!.body));
    expect(init).toMatchObject({ filename: 'logo.jpg', mime_type: 'image/jpeg', size_bytes: 1000 });
    const form = calls[1]!.body as FormData;
    expect((form.get('file') as File).size).toBe(1000);
  });
});
