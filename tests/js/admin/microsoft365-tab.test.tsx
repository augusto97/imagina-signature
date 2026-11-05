import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Microsoft365Tab, type OutlookState } from '@admin/pages/settings/Microsoft365Tab';

const API = 'http://localhost/wp-json/imagina-signatures/v1';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let state: OutlookState;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function baseState(extra: Partial<OutlookState> = {}): OutlookState {
  return {
    enabled: false,
    replace_client_signature: false,
    add_in_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    version: '1.3.0.1',
    display_name: 'ACME signature',
    key_preview: '…abcdef',
    manifest_url: 'https://acme.example/wp-json/imagina-signatures/v1/outlook/manifest.xml?key=k1',
    manifest_download_url:
      'https://acme.example/wp-json/imagina-signatures/v1/outlook/manifest?key=k1&download=1',
    signature_endpoint: 'https://acme.example/wp-json/imagina-signatures/v1/outlook/signature',
    https: true,
    well_known_url: 'https://acme.example/.well-known/microsoft-officeaddins-allowed.json',
    well_known_served: true,
    well_known_payload: {
      allowed: [
        'https://acme.example/wp-content/plugins/imagina-signatures/assets/outlook/launchevent.js',
      ],
    },
    ...extra,
  };
}

function config(manageTeam: boolean): void {
  (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
    page: 'settings',
    userId: 1,
    capabilities: {
      use: true,
      manage_templates: true,
      manage_storage: true,
      manage_team: manageTeam,
    },
    apiBase: API,
    restNonce: 'n',
    locale: 'en_US',
    wpAdminUrl: '',
    urls: { signatures: '', templates: '', settings: '', editor: '' },
  };
}

beforeEach(() => {
  config(true);
  calls = [];
  state = baseState();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      if (url === `${API}/admin/outlook` && init.method === 'POST') {
        state = { ...state, ...(JSON.parse(String(init.body)) as Partial<OutlookState>) };
        return json(state);
      }
      if (url === `${API}/admin/outlook`) return json(state);
      if (url === `${API}/admin/outlook/regenerate-key`) {
        state = { ...state, key_preview: '…999999', version: '1.3.0.2' };
        return json(state);
      }
      if (url.startsWith(`${API}/templates`)) return json([]);
      if (url === `${API}/admin/site-settings`) return json({});
      return json({ code: 'nope' }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
});

describe('Microsoft365Tab', () => {
  it('shows the deployment guide and no HTTPS warning on an https site', async () => {
    render(<Microsoft365Tab />);
    expect(await screen.findByText('ACME signature')).toBeInTheDocument();
    expect(screen.getByText(/Settings → Integrated apps/)).toBeInTheDocument();
    expect(screen.getByText(/up to 24 hours/)).toBeInTheDocument();
    expect(screen.queryByText(/does not use HTTPS/)).toBeNull();
    // Disabled: no download link yet.
    expect(screen.queryByRole('link', { name: /Download manifest/ })).toBeNull();
  });

  it('warns when the site is not served over HTTPS', async () => {
    state = baseState({ https: false });
    render(<Microsoft365Tab />);
    expect(await screen.findByText(/does not use HTTPS/)).toBeInTheDocument();
  });

  it('saves the toggles and then offers the manifest download', async () => {
    render(<Microsoft365Tab />);
    fireEvent.click(await screen.findByLabelText(/Enable the Outlook add-in/));
    fireEvent.click(screen.getByLabelText(/Replace the user's own Outlook signature/));
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Download manifest/ })).toBeInTheDocument(),
    );
    const post = calls.find((c) => c.init.method === 'POST' && c.url === `${API}/admin/outlook`);
    expect(JSON.parse(String(post?.init.body))).toEqual({
      enabled: true,
      replace_client_signature: true,
    });
    expect(screen.getByRole('link', { name: /Download manifest/ })).toHaveAttribute(
      'href',
      state.manifest_download_url,
    );
  });

  it('regenerates the key after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Microsoft365Tab />);
    fireEvent.click(await screen.findByRole('button', { name: /Regenerate key/ }));

    expect(confirm).toHaveBeenCalled();
    expect(await screen.findByText('…999999')).toBeInTheDocument();
    expect(
      calls.some(
        (c) => c.url === `${API}/admin/outlook/regenerate-key` && c.init.method === 'POST',
      ),
    ).toBe(true);
  });

  it('explains how to publish the well-known file on sub-directory installs', async () => {
    state = baseState({ well_known_served: false });
    render(<Microsoft365Tab />);
    expect(await screen.findByText(/cannot serve from a sub-directory/)).toBeInTheDocument();
    expect(screen.getByText(/"allowed"/)).toBeInTheDocument();
  });

  it('is closed to users without the manage-team capability', () => {
    config(false);
    render(<Microsoft365Tab />);
    expect(screen.getByText(/Only team managers/)).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});
