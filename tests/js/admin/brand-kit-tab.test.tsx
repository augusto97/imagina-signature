import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emptyBrandKit, type BrandKit } from '@shared/brandKit';
import { uploadImage } from '@admin/services/uploads';
import { BrandingTab } from '@admin/pages/settings/BrandingTab';

const API = 'http://localhost/wp-json/imagina-signatures/v1';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let responder: (call: Call) => Response;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adminConfig(extra: Record<string, unknown> = {}): void {
  (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
    page: 'settings',
    userId: 1,
    capabilities: { use: true, manage_templates: true, manage_storage: true },
    apiBase: API,
    restNonce: 'admin-nonce',
    locale: 'en_US',
    wpAdminUrl: 'http://localhost/wp-admin/',
    urls: { signatures: '', templates: '', settings: '', editor: '' },
    ...extra,
  };
}

beforeEach(() => {
  adminConfig();
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
  delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
});

const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' });

describe('admin uploadImage', () => {
  it('runs /upload/init then /upload/direct with the REST nonce', async () => {
    responder = (call) => {
      if (call.url === `${API}/upload/init`)
        return json({ method: 'direct', url: `${API}/upload/direct` });
      if (call.url === `${API}/upload/direct`)
        return json({ id: 4, public_url: 'https://site.example/u/logo.png' }, 201);
      return json({}, 404);
    };

    expect(await uploadImage(png(), 'Acme Logo.PNG')).toEqual({
      id: 4,
      url: 'https://site.example/u/logo.png',
    });
    expect(calls.map((c) => c.url)).toEqual([`${API}/upload/init`, `${API}/upload/direct`]);
    const init = JSON.parse(String(calls[0]!.init.body));
    expect(init).toMatchObject({
      filename: 'Acme Logo.png',
      mime_type: 'image/png',
      size_bytes: 7,
    });
    const direct = calls[1]!;
    expect(new Headers(direct.init.headers as HeadersInit).get('x-wp-nonce')).toBe('admin-nonce');
    expect((direct.init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('reuses a duplicate asset', async () => {
    responder = () =>
      json({ method: 'duplicate', asset: { id: 2, public_url: 'https://site.example/dup.png' } });
    expect(await uploadImage(png())).toEqual({ id: 2, url: 'https://site.example/dup.png' });
    expect(calls).toHaveLength(1);
  });

  it('refuses SVG and disabled uploads without calling the server', async () => {
    responder = () => json({});
    await expect(
      uploadImage(new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'logo'),
    ).rejects.toThrow(/SVG/);
    adminConfig({ uploadEnabled: false });
    await expect(uploadImage(png(), 'logo')).rejects.toMatchObject({ code: 'uploads_disabled' });
    expect(calls).toHaveLength(0);
  });

  it('surfaces server errors', async () => {
    responder = () => json({ code: 'imgsig_rate_limited', message: 'Slow down.' }, 429);
    await expect(uploadImage(png())).rejects.toMatchObject({
      code: 'imgsig_rate_limited',
      message: 'Slow down.',
    });
  });
});

describe('BrandingTab (Brand kit)', () => {
  function settings(kit: BrandKit = emptyBrandKit()) {
    return {
      brand_palette: ['#2563eb'],
      compliance_footer: { enabled: false, html: '' },
      banner_campaigns: [],
      brand_kit: kit,
    };
  }

  it('hides the logo Upload button in URL-only storage mode', async () => {
    adminConfig({ uploadEnabled: false });
    responder = () => json(settings());
    render(<BrandingTab />);
    await screen.findByText('Company');
    expect(screen.queryByText('Upload logo')).toBeNull();
  });

  it('shows the Upload button and saves the kit with the palette in one PATCH', async () => {
    let patched: Record<string, unknown> | null = null;
    responder = (call) => {
      if (call.init.method === 'PATCH') {
        patched = JSON.parse(String(call.init.body));
        const sent = (patched as { brand_kit: BrandKit }).brand_kit;
        // Server clears the non-http(s) link it rejects.
        return json(settings({ ...sent, social: { ...sent.social, github: '' } }));
      }
      return json(settings());
    };

    render(<BrandingTab />);
    await screen.findByText('Upload logo');

    fireEvent.change(screen.getByLabelText(/Company name/), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/GitHub/), { target: { value: 'ftp://acme' } });
    expect(screen.getAllByText('Acme').length).toBeGreaterThan(0); // live sample line
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Save brand kit'));

    await waitFor(() => expect(patched).not.toBeNull());
    const body = patched as unknown as { brand_palette: string[]; brand_kit: BrandKit };
    expect(body.brand_palette).toEqual(['#2563eb']);
    expect(body.brand_kit.company.name).toBe('Acme');
    expect(await screen.findByText(/were not valid and were cleared: GitHub/)).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });
});
