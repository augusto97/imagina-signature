import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  GoogleWorkspaceTab,
  type GmailPushRow,
  type GmailSettingsView,
} from '@admin/pages/settings/GoogleWorkspaceTab';

const API = 'http://localhost/wp-json/imagina-signatures/v1';
const SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic';

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let responder: (call: Call) => Response;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function view(extra: Partial<GmailSettingsView> = {}): GmailSettingsView {
  return {
    configured: false,
    ready: false,
    client_email: '',
    client_id: '',
    project_id: '',
    private_key_id: '',
    key_fingerprint: '',
    domains: [],
    auto_push: false,
    daily_sync: false,
    push_aliases: false,
    scope: SCOPE,
    updated_at: '',
    next_daily_sync: null,
    domain_hint: 'acme.com',
    sync: { running: false, started_at: '', finished_at: '', scanned: 0, pushed: 0, failed: 0 },
    ...extra,
  };
}

const CONNECTED = view({
  configured: true,
  ready: true,
  client_email: 'pusher@acme-sig.iam.gserviceaccount.com',
  client_id: '112233445566778899001',
  project_id: 'acme-sig',
  private_key_id: 'abc123',
  key_fingerprint: 'f'.repeat(64),
  domains: ['acme.com'],
});

function row(user_id: number, status = 'pushed'): GmailPushRow {
  return { user_id, status, email: `u${user_id}@acme.com`, name: `User ${user_id}`, message: '' };
}

beforeEach(() => {
  (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
    page: 'settings',
    userId: 1,
    capabilities: { use: true, manage_templates: true, manage_storage: true },
    apiBase: API,
    restNonce: 'admin-nonce',
    locale: 'en_US',
    wpAdminUrl: 'http://localhost/wp-admin/',
    urls: { signatures: '', templates: '', settings: '', editor: '' },
  };
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        url: String(url),
        method: (init.method ?? 'GET').toUpperCase(),
        body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      };
      calls.push(call);
      return responder(call);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
});

describe('GoogleWorkspaceTab', () => {
  it('shows the setup guide with the scope and the client ID to copy', async () => {
    responder = () => json(CONNECTED);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(<GoogleWorkspaceTab />);

    expect(await screen.findByText('112233445566778899001')).toBeInTheDocument();
    expect(screen.getByText(SCOPE)).toBeInTheDocument();
    expect(screen.getByText('Enable the Gmail API')).toBeInTheDocument();
    expect(screen.getByText('pusher@acme-sig.iam.gserviceaccount.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Google Admin console/ })).toHaveAttribute(
      'href',
      'https://admin.google.com/ac/owl/domainwidedelegation',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy Client ID' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('112233445566778899001'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Scope' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SCOPE));
  });

  it('saves the pasted key with domains and toggles, then hides the key input', async () => {
    responder = (call) =>
      call.method === 'PATCH' ? json({ ...CONNECTED, auto_push: true }) : json(view());

    render(<GoogleWorkspaceTab />);

    const textarea = await screen.findByPlaceholderText('Paste the JSON key here…');
    expect(screen.getByText('Shown after you upload the key')).toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: ' {"type":"service_account"} ' } });
    fireEvent.change(screen.getByPlaceholderText('acme.com'), {
      target: { value: 'acme.com, acme.co' },
    });
    fireEvent.click(screen.getByLabelText(/Push automatically/));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Google Workspace settings saved.')).toBeInTheDocument();
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe(`${API}/admin/deploy/gmail/settings`);
    expect(patch?.body).toEqual({
      service_account: '{"type":"service_account"}',
      domains: 'acme.com, acme.co',
      auto_push: true,
      daily_sync: false,
      push_aliases: false,
    });
    expect(screen.queryByPlaceholderText('Paste the JSON key here…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace key' })).toBeInTheDocument();
  });

  it('shows field-level validation errors from the server', async () => {
    responder = (call) =>
      call.method === 'PATCH'
        ? json(
            {
              code: 'imgsig_validation_failed',
              message: 'This is not a valid Google service-account key file.',
              data: {
                status: 400,
                errors: [{ path: 'type', message: 'The file must be a service-account key.' }],
              },
            },
            400,
          )
        : json(view());

    render(<GoogleWorkspaceTab />);
    fireEvent.change(await screen.findByPlaceholderText('Paste the JSON key here…'), {
      target: { value: '{"type":"authorized_user"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/The file must be a service-account key\./)).toBeInTheDocument();
  });

  it('reads an uploaded JSON key file into the form', async () => {
    responder = () => json(view());
    render(<GoogleWorkspaceTab />);
    await screen.findByPlaceholderText('Paste the JSON key here…');

    const file = new File(['{"type":"service_account","client_id":"1"}'], 'key.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('gmail-key-file'), { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Paste the JSON key here…')).toHaveValue(
        '{"type":"service_account","client_id":"1"}',
      ),
    );
  });

  it('runs the connection test and shows the diagnosis with Google’s text', async () => {
    responder = (call) =>
      call.url.endsWith('/test')
        ? json({
            success: false,
            code: 'delegation_missing',
            email: 'ana@acme.com',
            message: 'Domain-wide delegation is not granted.',
            google: 'unauthorized_client: Client is unauthorized',
            help_url: 'https://admin.google.com/ac/owl/domainwidedelegation',
          })
        : json(CONNECTED);

    render(<GoogleWorkspaceTab />);
    fireEvent.change(await screen.findByLabelText('Email to test'), {
      target: { value: 'ana@acme.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    expect(await screen.findByText('Domain-wide delegation is not granted.')).toBeInTheDocument();
    expect(
      screen.getByText('Google said: unauthorized_client: Client is unauthorized'),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/test'))?.body).toEqual({ email: 'ana@acme.com' });
  });

  it('loops the bulk push endpoint until next_offset is null and lists the results', async () => {
    responder = (call) => {
      if (!call.url.endsWith('/push')) return json(CONNECTED);
      if (call.body?.offset === 0) {
        return json({
          results: Array.from({ length: 20 }, (_, i) => row(i + 1)),
          next_offset: 20,
          total: 23,
          processed: 20,
        });
      }
      return json({
        results: [
          row(21),
          { ...row(22, 'needs_recompile'), message: 'Needs recompile: open and save it.' },
          {
            ...row(23, 'error'),
            error: 'Gmail API not enabled.',
            error_code: 'api_disabled',
            google: 'SERVICE_DISABLED',
          },
        ],
        next_offset: null,
        total: 23,
        processed: 23,
      });
    };

    render(<GoogleWorkspaceTab />);
    fireEvent.click(await screen.findByLabelText(/Re-push even when Gmail is already up to date/));
    fireEvent.click(screen.getByRole('button', { name: 'Push to everyone now' }));

    expect(await screen.findByText('Done: 23 users processed.')).toBeInTheDocument();
    const pushes = calls.filter((c) => c.url.endsWith('/push'));
    expect(pushes.map((c) => c.body)).toEqual([
      { all: true, force: true, offset: 0 },
      { all: true, force: true, offset: 20 },
    ]);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('Needs recompile: open and save it.')).toBeInTheDocument();
    expect(screen.getByText('Gmail API not enabled.')).toBeInTheDocument();
    expect(screen.getByText('Google said: SERVICE_DISABLED')).toBeInTheDocument();
    expect(screen.getByText('User 23')).toBeInTheDocument();
  });

  it('explains the missing capability on 403', async () => {
    responder = () =>
      json({ code: 'imgsig_forbidden', message: 'Forbidden', data: { status: 403 } }, 403);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responder({ url: '', method: 'GET', body: null })),
    );

    render(<GoogleWorkspaceTab />);

    expect(await screen.findByText(/requires the "Manage team" permission/)).toBeInTheDocument();
  });
});
