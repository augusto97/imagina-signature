import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiCall, ApiError, getConfig, refreshRestNonce } from '@/bridge/apiClient';
import { apiCall as adminApiCall } from '@admin/api';
import { isNonceError, resolveAjaxUrl } from '@shared/restNonce';

type FetchMock = ReturnType<typeof vi.fn>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const nonceFailure = (): Response =>
  json({ code: 'rest_cookie_invalid_nonce', message: 'Cookie check failed', data: { status: 403 } }, 403);

function headerOf(call: unknown[], name: string): string | undefined {
  const init = call[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

describe('isNonceError / resolveAjaxUrl', () => {
  it('only treats 401/403 nonce codes as nonce failures', () => {
    expect(isNonceError(403, 'rest_cookie_invalid_nonce')).toBe(true);
    expect(isNonceError(401, 'imgsig_bad_nonce')).toBe(true);
    expect(isNonceError(403, 'imgsig_forbidden')).toBe(false);
    expect(isNonceError(500, 'rest_cookie_invalid_nonce')).toBe(false);
    expect(isNonceError(403, undefined)).toBe(false);
  });

  it('falls back to the conventional admin-ajax.php location', () => {
    expect(resolveAjaxUrl({ restNonce: 'x', ajaxUrl: 'https://a.test/wp/wp-admin/admin-ajax.php' })).toBe(
      'https://a.test/wp/wp-admin/admin-ajax.php',
    );
    expect(resolveAjaxUrl({ restNonce: 'x' })).toBe(`${window.location.origin}/wp-admin/admin-ajax.php`);
  });
});

describe('editor apiCall nonce refresh', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    getConfig().restNonce = 'stale-nonce';
    (getConfig() as { ajaxUrl?: string }).ajaxUrl = 'http://localhost/wp-admin/admin-ajax.php';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (getConfig() as { ajaxUrl?: string }).ajaxUrl;
  });

  it('refreshes the nonce on rest_cookie_invalid_nonce and retries once', async () => {
    fetchMock
      .mockResolvedValueOnce(nonceFailure())
      .mockResolvedValueOnce(new Response('abc123def0', { status: 200 }))
      .mockResolvedValueOnce(json({ id: 5 }));

    const result = await apiCall<{ id: number }>('/signatures/5', { method: 'PATCH', body: { a: 1 } });

    expect(result).toEqual({ id: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(headerOf(fetchMock.mock.calls[0]!, 'X-WP-Nonce')).toBe('stale-nonce');
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      'http://localhost/wp-admin/admin-ajax.php?action=rest-nonce',
    );
    expect((fetchMock.mock.calls[1]![1] as RequestInit).credentials).toBe('include');
    expect(headerOf(fetchMock.mock.calls[2]!, 'X-WP-Nonce')).toBe('abc123def0');
    // Body is re-sent on the retry.
    expect((fetchMock.mock.calls[2]![1] as RequestInit).body).toBe(JSON.stringify({ a: 1 }));
    // In-memory config updated for every later caller.
    expect(getConfig().restNonce).toBe('abc123def0');
  });

  it('throws the original error when WordPress refuses a new nonce (logged out)', async () => {
    fetchMock
      .mockResolvedValueOnce(nonceFailure())
      .mockResolvedValueOnce(new Response('0', { status: 400 }));

    await expect(apiCall('/me')).rejects.toMatchObject({
      code: 'rest_cookie_invalid_nonce',
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getConfig().restNonce).toBe('stale-nonce');
  });

  it('retries only once even if the retry fails again', async () => {
    fetchMock
      .mockResolvedValueOnce(nonceFailure())
      .mockResolvedValueOnce(new Response('fffeee1111', { status: 200 }))
      .mockResolvedValueOnce(nonceFailure());

    await expect(apiCall('/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not refresh on a genuine permission error', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 'imgsig_forbidden', message: 'No' }, 403));
    await expect(apiCall('/signatures/9')).rejects.toMatchObject({ code: 'imgsig_forbidden' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh request between concurrent callers', async () => {
    let resolveNonce: (r: Response) => void = () => undefined;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('admin-ajax.php')) {
        return new Promise<Response>((resolve) => {
          resolveNonce = resolve;
        });
      }
      return Promise.resolve(nonceFailure());
    });

    const a = refreshRestNonce();
    const b = refreshRestNonce();
    resolveNonce(new Response('1234567890', { status: 200 }));
    expect(await a).toBe('1234567890');
    expect(await b).toBe('1234567890');
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('admin-ajax.php'))).toHaveLength(1);
  });
});

describe('admin apiCall nonce refresh', () => {
  let fetchMock: FetchMock;
  const adminConfig = {
    page: 'signatures',
    userId: 1,
    capabilities: { use: true, manage_templates: true, manage_storage: true },
    apiBase: 'http://localhost/wp-json/imagina-signatures/v1',
    restNonce: 'old-admin',
    locale: 'en_US',
    wpAdminUrl: 'http://localhost/wp-admin/',
    urls: { signatures: '', templates: '', settings: '', editor: '' },
  };

  beforeEach(() => {
    (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = { ...adminConfig };
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
  });

  it('refreshes via the fallback admin-ajax URL and retries', async () => {
    fetchMock
      .mockResolvedValueOnce(nonceFailure())
      .mockResolvedValueOnce(new Response('newadmin01\n', { status: 200 }))
      .mockResolvedValueOnce(json([]));

    await expect(adminApiCall('/signatures')).resolves.toEqual([]);
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      `${window.location.origin}/wp-admin/admin-ajax.php?action=rest-nonce`,
    );
    expect(headerOf(fetchMock.mock.calls[2]!, 'X-WP-Nonce')).toBe('newadmin01');
  });
});
