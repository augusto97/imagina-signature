import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, QrCodeBlock, VCardBlock } from '@/core/schema/blocks';
import { qrContentHash, useHostedAssetSync } from '@/core/blocks/qr-code/definition';
import { vcardContentHash } from '@/core/blocks/vcard/definition';
import { useSchemaStore } from '@/stores/schemaStore';
import '@/core/blocks';

function compile(blocks: Block[]) {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  return compileSignature(schema);
}

const qr = (extra: Partial<QrCodeBlock> = {}): QrCodeBlock => ({
  id: 'qr1',
  type: 'qr_code',
  data: 'https://acme.example',
  size: 120,
  color: '#000000',
  background_color: '#ffffff',
  ...extra,
});

const vcard = (extra: Partial<VCardBlock> = {}): VCardBlock => ({
  id: 'vc1',
  type: 'vcard',
  label: 'Save my contact',
  full_name: 'Jane Doe',
  organization: 'ACME',
  title: '',
  email: 'jane@acme.example',
  phone: '',
  website: '',
  background_color: '#2563eb',
  text_color: '#ffffff',
  border_radius: 6,
  ...extra,
});

describe('QR code compile (hosted PNG)', () => {
  it('emits nothing and reports an error when the image was never uploaded', () => {
    const result = compile([qr()]);
    expect(result.html).not.toContain('<img');
    expect(result.html).not.toContain('data:');
    const err = result.issues.find((i) => i.code === 'qr-not-uploaded');
    expect(err?.level).toBe('error');
    expect(err?.blockId).toBe('qr1');
  });

  it('references the hosted URL with width/height = size', () => {
    const block = qr();
    block.image_url = 'https://cdn.example/qr.png';
    block.image_hash = qrContentHash(block);
    const result = compile([block]);
    const img = new DOMParser().parseFromString(result.html, 'text/html').querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://cdn.example/qr.png');
    expect(img.getAttribute('width')).toBe('120');
    expect(img.getAttribute('height')).toBe('120');
    expect(img.getAttribute('alt')).toBe('QR code');
    expect(result.errors).toEqual([]);
    expect(result.issues.some((i) => i.code === 'qr-stale')).toBe(false);
  });

  it('warns (but still renders) when the hosted image is stale', () => {
    const block = qr({ image_url: 'https://cdn.example/qr.png', image_hash: 'old' });
    const result = compile([block]);
    expect(result.html).toContain('src="https://cdn.example/qr.png"');
    expect(result.issues.find((i) => i.code === 'qr-stale')?.level).toBe('warning');
  });

  it('hash changes with data, size and colours only', () => {
    const base = qrContentHash(qr());
    expect(qrContentHash(qr({ caption: 'Scan me' }))).toBe(base);
    expect(qrContentHash(qr({ data: 'https://other.example' }))).not.toBe(base);
    expect(qrContentHash(qr({ size: 140 }))).not.toBe(base);
    expect(qrContentHash(qr({ color: '#111111' }))).not.toBe(base);
    expect(qrContentHash(qr({ background_color: '#eeeeee' }))).not.toBe(base);
  });

  it('emits nothing for an empty QR', () => {
    const result = compile([qr({ data: '' })]);
    expect(result.html).not.toContain('<img');
    expect(result.errors).toEqual([]);
  });
});

describe('vCard compile (hosted .vcf)', () => {
  it('links to the hosted file instead of a data: URI', () => {
    const block = vcard();
    block.vcf_url = 'https://cdn.example/jane-doe.vcf';
    block.vcf_hash = vcardContentHash(block);
    const result = compile([block]);
    expect(result.html).toContain('href="https://cdn.example/jane-doe.vcf"');
    expect(result.html).not.toContain('data:');
    expect(result.html).not.toContain('download=');
    expect(result.errors).toEqual([]);
    expect(result.text).toBe('Save my contact: https://cdn.example/jane-doe.vcf');
  });

  it('reports an error and emits nothing before the upload', () => {
    const result = compile([vcard()]);
    expect(result.html).not.toContain('<a');
    expect(result.issues.find((i) => i.code === 'vcard-not-uploaded')?.level).toBe('error');
  });

  it('warns about a stale file and skips an empty card', () => {
    const stale = compile([vcard({ vcf_url: 'https://cdn.example/x.vcf', vcf_hash: 'old' })]);
    expect(stale.issues.some((i) => i.code === 'vcard-stale')).toBe(true);
    const empty = compile([vcard({ full_name: '', organization: '', email: '' })]);
    expect(empty.issues.some((i) => i.code === 'vcard-empty')).toBe(true);
    expect(empty.errors).toEqual([]);
  });
});

describe('useHostedAssetSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const schema = createEmptySchema();
    schema.blocks = [qr()];
    useSchemaStore.setState({ schema });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const hashOf = (b: Block) => (b.type === 'qr_code' ? qrContentHash(b) : null);

  it('uploads after the debounce and stores the result via updateBlock', async () => {
    const block = qr();
    const upload = vi.fn(async () => ({
      image_url: 'https://cdn.example/q.png',
      image_hash: qrContentHash(block),
    }));
    renderHook(() =>
      useHostedAssetSync({
        blockId: 'qr1',
        hash: qrContentHash(block),
        upToDate: false,
        canSync: true,
        upload,
        hashOf,
      }),
    );

    expect(upload).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(upload).toHaveBeenCalledTimes(1);
    const stored = useSchemaStore.getState().schema.blocks[0] as QrCodeBlock;
    expect(stored.image_url).toBe('https://cdn.example/q.png');
  });

  it('does nothing when the hosted asset is already up to date', async () => {
    const upload = vi.fn(async () => ({}));
    renderHook(() =>
      useHostedAssetSync({
        blockId: 'qr1',
        hash: 'h',
        upToDate: true,
        canSync: true,
        upload,
        hashOf,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('flushes a pending upload when the panel unmounts', async () => {
    const block = qr();
    const upload = vi.fn(async () => ({
      image_url: 'https://cdn.example/q2.png',
      image_hash: qrContentHash(block),
    }));
    const { unmount } = renderHook(() =>
      useHostedAssetSync({
        blockId: 'qr1',
        hash: qrContentHash(block),
        upToDate: false,
        canSync: true,
        upload,
        hashOf,
      }),
    );
    unmount();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect((useSchemaStore.getState().schema.blocks[0] as QrCodeBlock).image_url).toBe(
      'https://cdn.example/q2.png',
    );
  });

  it('drops a result whose content changed while uploading', async () => {
    const upload = vi.fn(async () => ({
      image_url: 'https://cdn.example/old.png',
      image_hash: 'x',
    }));
    renderHook(() =>
      useHostedAssetSync({
        blockId: 'qr1',
        hash: 'not-the-current-hash',
        upToDate: false,
        canSync: true,
        upload,
        hashOf,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(upload).toHaveBeenCalled();
    expect((useSchemaStore.getState().schema.blocks[0] as QrCodeBlock).image_url).toBeUndefined();
  });
});
