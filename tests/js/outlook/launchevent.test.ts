import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * assets/outlook/launchevent.js is a plain script (no build step) that
 * Outlook runs on OnNewMessageCompose / OnNewAppointmentOrganizer. It is
 * evaluated here against a mocked `Office` object, in jsdom.
 */

const SOURCE = readFileSync(resolve(process.cwd(), 'assets/outlook/launchevent.js'), 'utf8');
const KEY = 'a'.repeat(64);
const API = 'https://acme.example/wp-json/imagina-signatures/v1/outlook/signature';
const RUNTIME_QUERY = `?key=${KEY}&api=${encodeURIComponent(API)}`;
const HTML = '<table role="presentation"><tr><td>Ana</td></tr></table>';
const CACHE_KEY = 'imgsig_outlook_signature';

type Callback = (result: { status: string }) => void;
type Handler = (event: { completed: () => void }) => void;

interface OfficeMock {
  office: Record<string, unknown>;
  handlers: Record<string, Handler>;
  setSignatureAsync: ReturnType<typeof vi.fn>;
  disableClientSignatureAsync: ReturnType<typeof vi.fn>;
  roaming: Record<string, unknown>;
}

function mockOffice(options: { jsRuntimeUrl?: string; email?: string } = {}): OfficeMock {
  const handlers: Record<string, Handler> = {};
  const roaming: Record<string, unknown> = {};
  const setSignatureAsync = vi.fn((_html: string, _opts: unknown, cb: Callback) =>
    cb({ status: 'succeeded' }),
  );
  const disableClientSignatureAsync = vi.fn((_opts: unknown, cb: Callback) =>
    cb({ status: 'succeeded' }),
  );
  const office = {
    CoercionType: { Html: 'html' },
    AsyncResultStatus: { Succeeded: 'succeeded', Failed: 'failed' },
    onReady: vi.fn(),
    actions: {
      associate: (name: string, fn: Handler) => {
        handlers[name] = fn;
      },
    },
    context: {
      mailbox: {
        userProfile: { emailAddress: options.email ?? 'Ana@Acme.example' },
        item: { body: { setSignatureAsync }, disableClientSignatureAsync },
      },
      roamingSettings: {
        get: (name: string) => roaming[name],
        set: (name: string, value: unknown) => {
          roaming[name] = value;
        },
        saveAsync: vi.fn((cb?: Callback) => cb?.({ status: 'succeeded' })),
      },
      urls: options.jsRuntimeUrl ? { javascriptRuntimeUrl: options.jsRuntimeUrl } : undefined,
    },
  };
  return { office, handlers, setSignatureAsync, disableClientSignatureAsync, roaming };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Installs the mocks and evaluates the runtime script, as Outlook would load it. */
function boot(
  mock: OfficeMock,
  path = `/wp-content/plugins/imagina-signatures/assets/outlook/commands.html${RUNTIME_QUERY}`,
): void {
  window.history.replaceState(null, '', path);
  vi.stubGlobal('Office', mock.office);
  new Function(SOURCE)();
}

async function run(
  mock: OfficeMock,
  handler = 'onNewMessageComposeHandler',
): Promise<ReturnType<typeof vi.fn>> {
  const completed = vi.fn();
  expect(typeof mock.handlers[handler]).toBe('function');
  mock.handlers[handler]!({ completed });
  await vi.waitFor(() => expect(completed).toHaveBeenCalled());
  return completed;
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn(async () => json({ html: HTML, hash: 'h1', replace_client_signature: false }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Outlook launchevent.js', () => {
  it('fetches the signature with the deployment key and inserts it as HTML', async () => {
    const mock = mockOffice();
    boot(mock);

    const completed = await run(mock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}?email=ana%40acme.example`);
    expect((init.headers as Record<string, string>)['X-Imgsig-Deploy-Key']).toBe(KEY);
    expect(init.credentials).toBe('omit');

    expect(mock.setSignatureAsync).toHaveBeenCalledTimes(1);
    expect(mock.setSignatureAsync.mock.calls[0]![0]).toBe(HTML);
    expect(mock.setSignatureAsync.mock.calls[0]![1]).toEqual({ coercionType: 'html' });
    expect(mock.disableClientSignatureAsync).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('associates every handler named in the manifest', () => {
    const mock = mockOffice();
    boot(mock);
    expect(Object.keys(mock.handlers).sort()).toEqual([
      'insertImaginaSignature',
      'onNewAppointmentOrganizerHandler',
      'onNewMessageComposeHandler',
    ]);
    expect(mock.office.onReady).toHaveBeenCalled();
  });

  it('handles new appointments and the Insert signature button the same way', async () => {
    const mock = mockOffice();
    boot(mock);
    await run(mock, 'onNewAppointmentOrganizerHandler');
    await run(mock, 'insertImaginaSignature');
    expect(mock.setSignatureAsync).toHaveBeenCalledTimes(2);
  });

  it('caches the answer for an hour', async () => {
    const mock = mockOffice();
    boot(mock);

    await run(mock);
    await run(mock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.setSignatureAsync).toHaveBeenCalledTimes(2);
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null');
    expect(cached).toMatchObject({ email: 'ana@acme.example', html: HTML, hash: 'h1' });
  });

  it('refetches once the cache is older than an hour', async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        email: 'ana@acme.example',
        html: '<p>old</p>',
        hash: 'h0',
        replace: false,
        at: Date.now() - 61 * 60 * 1000,
      }),
    );
    const mock = mockOffice();
    boot(mock);

    await run(mock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.setSignatureAsync.mock.calls[0]![0]).toBe(HTML);
  });

  it('still completes when the fetch fails, without inserting anything', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const mock = mockOffice();
    boot(mock);

    const completed = await run(mock);

    expect(completed).toHaveBeenCalledTimes(1);
    expect(mock.setSignatureAsync).not.toHaveBeenCalled();
  });

  it('falls back to the last good copy when the site is unreachable', async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        email: 'ana@acme.example',
        html: '<p>last good</p>',
        hash: 'h0',
        replace: false,
        at: Date.now() - 3 * 60 * 60 * 1000,
      }),
    );
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const mock = mockOffice();
    boot(mock);

    await run(mock);

    expect(mock.setSignatureAsync.mock.calls[0]![0]).toBe('<p>last good</p>');
  });

  it('inserts nothing for a 404 (no signature for this mailbox)', async () => {
    fetchMock.mockResolvedValue(json({ code: 'imgsig_outlook_not_found' }, 404));
    const mock = mockOffice();
    boot(mock);

    const completed = await run(mock);

    expect(completed).toHaveBeenCalledTimes(1);
    expect(mock.setSignatureAsync).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('turns off the client signature first when the admin asked for it', async () => {
    fetchMock.mockResolvedValue(json({ html: HTML, hash: 'h1', replace_client_signature: true }));
    const mock = mockOffice();
    boot(mock);

    await run(mock);

    expect(mock.disableClientSignatureAsync).toHaveBeenCalledTimes(1);
    expect(mock.setSignatureAsync).toHaveBeenCalledTimes(1);
    expect(mock.disableClientSignatureAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mock.setSignatureAsync.mock.invocationCallOrder[0]!,
    );
  });

  it('completes even when Outlook throws', async () => {
    const mock = mockOffice();
    mock.setSignatureAsync.mockImplementation(() => {
      throw new Error('boom');
    });
    boot(mock);

    const completed = await run(mock);
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('skips signatures longer than setSignatureAsync accepts', async () => {
    fetchMock.mockResolvedValue(json({ html: `<p>${'x'.repeat(30001)}</p>`, hash: 'big' }));
    const mock = mockOffice();
    boot(mock);

    await run(mock);
    expect(mock.setSignatureAsync).not.toHaveBeenCalled();
  });

  it('reads the key from javascriptRuntimeUrl when the page URL has none (classic Outlook)', async () => {
    const mock = mockOffice({
      jsRuntimeUrl: `https://acme.example/wp-content/plugins/imagina-signatures/assets/outlook/launchevent.js${RUNTIME_QUERY}`,
    });
    boot(mock, '/');

    await run(mock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.setSignatureAsync).toHaveBeenCalledTimes(1);
    // Remembered for runtimes that can't read their own URL.
    expect(mock.roaming.imgsig_outlook_config).toEqual({ key: KEY, api: API });
  });

  it('uses the configuration remembered in roaming settings as a last resort', async () => {
    const mock = mockOffice();
    mock.roaming.imgsig_outlook_config = { key: KEY, api: API };
    boot(mock, '/');

    await run(mock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing (but completes) without a valid configuration', async () => {
    const mock = mockOffice();
    boot(mock, `/commands.html?key=short&api=${encodeURIComponent('http://insecure.example/x')}`);

    const completed = await run(mock);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
