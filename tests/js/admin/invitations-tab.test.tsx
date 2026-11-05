import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InvitationsTab } from '@admin/pages/settings/InvitationsTab';
import { SignaturesPage } from '@admin/pages/SignaturesPage';

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

const IDLE = {
  id: null,
  kind: null,
  status: 'idle',
  running: false,
  total: 0,
  processed: 0,
  pending: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  percent: 0,
  finished_at: null,
  report: [],
};
const SETTINGS = { enabled: false, after_days: 3, max: 2 };

beforeEach(() => {
  (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
    page: 'settings',
    userId: 1,
    capabilities: { use: true, manage_templates: true, manage_storage: true },
    apiBase: API,
    restNonce: 'admin-nonce',
    locale: 'en_US',
    wpAdminUrl: 'http://localhost/wp-admin/',
    urls: { signatures: '', templates: '', settings: '', editor: 'http://localhost/editor/__ID__' },
  };
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url: String(url), init };
      calls.push(call);
      return responder(call);
    }),
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
});

describe('Settings → Invitations', () => {
  it('sends to everyone with the message and shows the progress and skipped people', async () => {
    responder = (call) => {
      if (call.url === `${API}/admin/deploy/invitations/settings`) return json(SETTINGS);
      if (call.url === `${API}/admin/deploy/invitations/progress`) return json(IDLE);
      if (call.url === `${API}/admin/deploy/invitations` && call.init.method === 'POST') {
        return json(
          {
            ...IDLE,
            id: 'j1',
            kind: 'invite',
            status: 'done',
            total: 3,
            processed: 3,
            sent: 2,
            skipped: 1,
            percent: 100,
            report: [
              {
                user_id: 7,
                name: 'Leo',
                email: 'leo@example.com',
                status: 'skipped',
                reason: 'not_ready',
              },
            ],
          },
          202,
        );
      }
      return json({}, 404);
    };

    render(<InvitationsTab />);
    await screen.findByText('Send reminders automatically');

    fireEvent.change(screen.getByLabelText(/^Message \(optional\)/), {
      target: { value: '  Hola equipo  ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send invitations' }));
    });

    const post = calls.find((c) => c.init.method === 'POST')!;
    expect(JSON.parse(String(post.init.body))).toEqual({ message: 'Hola equipo', all: true });
    expect(await screen.findByText('Finished: 3 of 3 processed')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('Sent: 2')).toBeInTheDocument();
    expect(
      screen.getByText('Signature not ready — open it in the editor and save it'),
    ).toBeInTheDocument();
  });

  it('picks people through the WordPress user search when /admin/users does not exist', async () => {
    responder = (call) => {
      if (call.url === `${API}/admin/deploy/invitations/settings`) return json(SETTINGS);
      if (call.url === `${API}/admin/deploy/invitations/progress`) return json(IDLE);
      if (call.url.startsWith(`${API}/admin/users`)) return json({ code: 'rest_no_route' }, 404);
      if (call.url.startsWith('http://localhost/wp-json/wp/v2/users?search=ana')) {
        return json([{ id: 12, name: 'Ana López', email: 'ana@example.com' }]);
      }
      if (call.url === `${API}/admin/deploy/invitations`)
        return json({ ...IDLE, id: 'j2', status: 'running', running: true, total: 1 }, 202);
      return json({}, 404);
    };

    render(<InvitationsTab />);
    fireEvent.click(await screen.findByLabelText('Choose people'));
    expect(screen.getByRole('button', { name: 'Send invitations' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'ana' } });
    fireEvent.click(await screen.findByRole('button', { name: /Ana López/ }, { timeout: 2000 }));

    const wpCall = calls.find((c) => c.url.includes('/wp/v2/users'))!;
    expect(new Headers(wpCall.init.headers).get('X-WP-Nonce')).toBe('admin-nonce');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send invitations' }));
    });
    const post = calls.find((c) => c.url === `${API}/admin/deploy/invitations`)!;
    expect(JSON.parse(String(post.init.body))).toEqual({ message: '', user_ids: [12] });
    expect(await screen.findByText('Sending… 0 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('saves the reminder settings', async () => {
    responder = (call) => {
      if (call.url === `${API}/admin/deploy/invitations/settings` && call.init.method === 'PATCH') {
        return json(JSON.parse(String(call.init.body)));
      }
      if (call.url === `${API}/admin/deploy/invitations/settings`) return json(SETTINGS);
      return json(IDLE);
    };

    render(<InvitationsTab />);
    fireEvent.click(await screen.findByLabelText('Send reminders automatically'));
    fireEvent.change(screen.getByLabelText(/^Days between reminders/), { target: { value: '5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save reminder settings' }));
    });

    const patch = calls.find((c) => c.init.method === 'PATCH')!;
    expect(JSON.parse(String(patch.init.body))).toEqual({ enabled: true, after_days: 5, max: 2 });
    expect(await screen.findByText('Reminder settings saved.')).toBeInTheDocument();
  });

  it('explains the missing permission instead of failing silently', async () => {
    responder = () => json({ code: 'imgsig_forbidden', message: 'Nope' }, 403);
    render(<InvitationsTab />);
    expect(await screen.findByText(/requires the "Manage team" permission/)).toBeInTheDocument();
  });
});

describe('My Signatures → Install', () => {
  it('opens the personal install link of the primary signature in a new tab', async () => {
    responder = (call) => {
      if (call.url.startsWith(`${API}/signatures`)) {
        return json([
          {
            id: 3,
            name: 'Main',
            status: 'ready',
            is_primary: true,
            updated_at: '2026-11-01 10:00:00',
          },
          {
            id: 4,
            name: 'Old',
            status: 'draft',
            is_primary: false,
            updated_at: '2026-10-01 10:00:00',
          },
        ]);
      }
      if (call.url === `${API}/me/install-link`)
        return json({ url: 'https://example.com/signatures/install/abc/' });
      return json({}, 404);
    };
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

    render(<SignaturesPage />);
    const install = await screen.findAllByRole('button', {
      name: /^Install .* in your email client$/,
    });
    expect(install).toHaveLength(1);

    await act(async () => {
      fireEvent.click(install[0]!);
    });
    await waitFor(() =>
      expect(tab.location.href).toBe('https://example.com/signatures/install/abc/'),
    );
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
  });
});
