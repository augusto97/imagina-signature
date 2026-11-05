import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  dataUrlToBlob,
  sha256HexSync,
  targetPixelWidth,
  uploadBlob,
  UploadError,
  UploadsDisabledError,
  withExtension,
} from '@/services/uploads';

type Call = { url: string; init: RequestInit };

const API = 'http://localhost/wp-json/imagina-signatures/v1';
const config = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
  .IMGSIG_EDITOR_CONFIG;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let calls: Call[] = [];
let responder: (call: Call) => Response;

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url: String(url), init };
      calls.push(call);
      return responder(call);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete config.uploadEnabled;
});

const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' });

function headersOf(call: Call): Record<string, string> {
  return Object.fromEntries(new Headers(call.init.headers as HeadersInit).entries());
}

describe('uploadBlob — direct (Media Library)', () => {
  it('runs init → multipart POST with the nonce and returns the asset', async () => {
    responder = (call) => {
      if (call.url === `${API}/upload/init`)
        return json({ method: 'direct', url: `${API}/upload/direct` });
      if (call.url === `${API}/upload/direct`)
        return json({ id: 7, public_url: 'https://site.example/u/a.png' }, 201);
      return json({}, 404);
    };

    const result = await uploadBlob(png(), 'avatar');

    expect(result).toEqual({ id: 7, url: 'https://site.example/u/a.png' });
    expect(calls.map((c) => c.url)).toEqual([`${API}/upload/init`, `${API}/upload/direct`]);

    const init = JSON.parse(String(calls[0]!.init.body));
    expect(init).toMatchObject({ filename: 'avatar.png', mime_type: 'image/png', size_bytes: 7 });
    expect(init.hash_sha256).toMatch(/^[0-9a-f]{64}$/);

    const direct = calls[1]!;
    expect(direct.init.method).toBe('POST');
    expect(direct.init.credentials).toBe('include');
    expect(headersOf(direct)['x-wp-nonce']).toBe('test-nonce');
    const form = direct.init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get('file') as File;
    expect(file.name).toBe('avatar.png');
  });

  it('short-circuits on a duplicate', async () => {
    responder = () =>
      json({ method: 'duplicate', asset: { id: 3, public_url: 'https://site.example/dup.png' } });
    expect(await uploadBlob(png(), 'x.png')).toEqual({
      id: 3,
      url: 'https://site.example/dup.png',
    });
    expect(calls).toHaveLength(1);
  });

  it('surfaces server errors from the multipart step', async () => {
    responder = (call) =>
      call.url.endsWith('/init')
        ? json({ method: 'direct', url: `${API}/upload/direct` })
        : json({ code: 'imgsig_unsupported_mime', message: 'Unsupported file type.' }, 400);
    await expect(uploadBlob(png(), 'x.png')).rejects.toMatchObject({
      code: 'imgsig_unsupported_mime',
      message: 'Unsupported file type.',
    });
  });
});

describe('uploadBlob — presigned (S3)', () => {
  // The server merges ['method' => 'presigned'] with the DTO, whose own
  // `method` ("PUT") wins — handle both spellings.
  it.each(['PUT', 'presigned'])(
    'PUTs with Content-Type = blob MIME, then finalizes (method %s)',
    async (method) => {
      responder = (call) => {
        if (call.url === `${API}/upload/init`) {
          return json({
            method,
            url: 'https://bucket.s3.example/users/1/123-qr.png?X-Amz-Signature=abc',
            headers: { 'Content-Type': 'image/png', 'x-amz-acl': 'public-read' },
            key: 'users/1/123-qr.png',
            public_url: 'https://cdn.example/users/1/123-qr.png',
          });
        }
        if (call.url.startsWith('https://bucket.s3.example/'))
          return new Response(null, { status: 200 });
        if (call.url === `${API}/upload/finalize`)
          return json({ id: 9, public_url: 'https://cdn.example/users/1/123-qr.png' }, 201);
        return json({}, 404);
      };

      const result = await uploadBlob(png(), 'qr.png', { width: 240, height: 240 });
      expect(result).toEqual({ id: 9, url: 'https://cdn.example/users/1/123-qr.png' });

      const put = calls[1]!;
      expect(put.init.method).toBe('PUT');
      expect(headersOf(put)['content-type']).toBe('image/png');
      expect(headersOf(put)['x-amz-acl']).toBe('public-read');
      expect(headersOf(put)['x-wp-nonce']).toBeUndefined();
      expect(put.init.credentials).toBeUndefined();

      const finalize = JSON.parse(String(calls[2]!.init.body));
      expect(finalize).toMatchObject({
        key: 'users/1/123-qr.png',
        mime_type: 'image/png',
        size_bytes: 7,
        width: 240,
        height: 240,
      });
      expect(finalize.hash_sha256).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it('reports a storage rejection', async () => {
    responder = (call) =>
      call.url.endsWith('/init')
        ? json({ method: 'PUT', url: 'https://bucket.example/k', key: 'users/1/k' })
        : new Response('denied', { status: 403 });
    await expect(uploadBlob(png(), 'x.png')).rejects.toMatchObject({
      code: 'storage_rejected',
      status: 403,
    });
  });

  it('sends vCards as text/vcard with a .vcf name', async () => {
    responder = (call) =>
      call.url.endsWith('/init')
        ? json({ method: 'PUT', url: 'https://bucket.example/k', key: 'users/1/k' })
        : call.url.endsWith('/finalize')
          ? json({ id: 1, public_url: 'https://cdn.example/jane.vcf' })
          : new Response(null, { status: 200 });
    const vcf = new Blob(['BEGIN:VCARD\r\nEND:VCARD'], { type: 'text/vcard' });
    await uploadBlob(vcf, 'jane-doe.vcf');
    const init = JSON.parse(String(calls[0]!.init.body));
    expect(init).toMatchObject({ filename: 'jane-doe.vcf', mime_type: 'text/vcard' });
    expect(headersOf(calls[1]!)['content-type']).toBe('text/vcard');
  });
});

describe('uploads disabled', () => {
  it('throws the typed error without calling the server when uploadEnabled is false', async () => {
    config.uploadEnabled = false;
    responder = () => json({});
    const err = await uploadBlob(png(), 'x.png').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UploadsDisabledError);
    expect((err as Error).message).toContain('Uploads are disabled on this site');
    expect(calls).toHaveLength(0);
  });

  it('maps the server-side imgsig_uploads_disabled error', async () => {
    responder = () => json({ code: 'imgsig_uploads_disabled', message: 'nope' }, 403);
    await expect(uploadBlob(png(), 'x.png')).rejects.toBeInstanceOf(UploadsDisabledError);
  });

  it('wraps network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const err = await uploadBlob(png(), 'x.png').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UploadError);
  });
});

describe('helpers', () => {
  it('pure-JS SHA-256 matches node:crypto', () => {
    for (const input of ['', 'abc', 'x'.repeat(1000), 'BEGIN:VCARD\r\nFN:Jané\r\nEND:VCARD']) {
      const bytes = new TextEncoder().encode(input);
      expect(sha256HexSync(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('decodes base64 and URL-encoded data URIs', async () => {
    const b = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=');
    expect(b.type).toBe('image/png');
    expect(b.size).toBe(8);
    const t = dataUrlToBlob('data:text/vcard;charset=utf-8,BEGIN%3AVCARD');
    expect(t.type).toBe('text/vcard');
    expect(t.size).toBe('BEGIN:VCARD'.length);
  });

  it('caps the pixel width at 2× display, max 1200', () => {
    expect(targetPixelWidth(64)).toBe(128);
    expect(targetPixelWidth(600)).toBe(1200);
    expect(targetPixelWidth(900)).toBe(1200);
  });

  it('gives filenames the extension the server sniffs', () => {
    expect(withExtension('avatar', 'image/png')).toBe('avatar.png');
    expect(withExtension('photo.jpeg', 'image/jpeg')).toBe('photo.jpeg');
    expect(withExtension('crop.png', 'image/jpeg')).toBe('crop.jpg');
    expect(withExtension('jane', 'text/vcard')).toBe('jane.vcf');
  });
});
