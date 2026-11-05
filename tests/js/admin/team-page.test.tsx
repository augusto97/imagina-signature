import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TeamPage } from '@admin/pages/TeamPage';
import { createEmptySchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';
import type { TeamResponse, TeamRow } from '@admin/pages/team/types';

const API = 'http://localhost/wp-json/imagina-signatures/v1';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let stalePending: number[] = [];

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function body(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body ?? '{}')) as Record<string, unknown>;
}

function person(id: number, name: string, overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    id,
    display_name: name,
    email: `${name.split(' ')[0]!.toLowerCase()}@acme.test`,
    roles: ['author'],
    groups: [{ id: 4, name: 'Sales', color: '#ff0000' }],
    avatar: '',
    can_use: true,
    signature_count: 1,
    primary: {
      id: id * 10,
      name: 'Main',
      status: 'ready',
      template_id: 9,
      template_name: 'Corporate',
      link: 'linked',
      updated_at: '2026-11-05 10:00:00',
      compiled_at: null,
      marked: true,
    },
    html: { state: 'outdated', compiled_at: null },
    gmail: { state: 'failed', at: null, message: 'Delegation is missing.' },
    outlook: { state: 'not_configured', at: null },
    install: {
      state: 'invited',
      invited_at: '2026-11-01 08:00:00',
      opened_at: null,
      installed_at: null,
      client: null,
      reminders: 0,
    },
    ...overrides,
  };
}

function team(): TeamResponse {
  return {
    items: [
      person(3, 'Ana Souza'),
      person(4, 'Bruno Díaz', { primary: null, html: { state: 'none', compiled_at: null } }),
    ],
    total: 2,
    page: 1,
    per_page: 25,
    total_pages: 1,
    summary: {
      users: 2,
      with_signature: 1,
      without_signature: 1,
      outdated_html: 1,
      gmail_pushed: 0,
      gmail_failed: 1,
      outlook_delivered: 0,
      installed: 0,
      install_outdated: 0,
      not_installed: 1,
      stale_signatures: stalePending.length,
    },
    channels: { gmail: { configured: true, auto_push: false }, outlook: { enabled: false } },
  };
}

function signatureSchema() {
  const s = createEmptySchema();
  s.blocks = [{ id: 't', type: 'text', content: '<p>{{wp_display_name}}</p>' } as TextBlock];
  return s;
}

beforeEach(() => {
  (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
    page: 'team',
    userId: 1,
    capabilities: { use: true, manage_templates: true, manage_storage: true, manage_team: true },
    apiBase: API,
    restNonce: 'admin-nonce',
    locale: 'en_US',
    wpAdminUrl: 'http://localhost/wp-admin/',
    urls: {
      signatures: '',
      templates: '',
      settings: '',
      editor: 'http://localhost/wp-admin/admin.php?page=imagina-signatures-editor&id=__ID__',
      team: 'http://localhost/wp-admin/admin.php?page=imagina-signatures-team',
    },
  };
  calls = [];
  stalePending = [30];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url: String(url), init };
      calls.push(call);
      const u = call.url;
      if (u.includes('/admin/groups')) return json([]);
      if (u.includes('/admin/team')) return json(team());
      if (u.includes('/admin/signatures/stale')) {
        const after = Number(new URL(u).searchParams.get('after_id') ?? 0);
        const items = stalePending
          .filter((id) => id > after)
          .map((id) => ({
            id,
            user_id: 3,
            name: 'Main',
            template_id: 9,
            link_mode: 'linked',
            status: 'ready',
            updated_at: '2026-11-05 10:00:00',
            compiled_at: null,
          }));
        return json(items, 200, { 'X-WP-Total': String(stalePending.length) });
      }
      if (u.includes('/render-context')) {
        return json({
          id: 30,
          user_id: 3,
          name: 'Main',
          template_id: 9,
          link_mode: 'linked',
          updated_at: '2026-11-05 10:00:00',
          compiled_at: null,
          locale: 'pt_BR',
          json_content: signatureSchema(),
          systemVariables: { wp_display_name: 'Ana Souza' },
          complianceFooter: { enabled: false, html: '' },
          bannerCampaigns: [],
          profileFields: [],
          pluginUrl: 'http://localhost/wp-content/plugins/imagina-signatures',
          inputs_hash: 'inputs-1',
        });
      }
      if (u.includes('/admin/signatures/30/html')) {
        stalePending = [];
        return json({
          id: 30,
          user_id: 3,
          compiled_at: '2026-11-05 11:00:00',
          updated_at: '2026-11-05 11:00:00',
          html_stale: false,
        });
      }
      if (u.includes('/admin/deploy/install-links/3')) {
        return json({ user_id: 3, url: 'https://acme.test/signatures/install/abc/' });
      }
      if (u.includes('/admin/deploy/invitations')) {
        return json({ total: 1, running: true }, 202);
      }
      return json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
});

describe('Team page', () => {
  it('lists people with their signature, HTML and channel states, and the counters', async () => {
    render(<TeamPage />);

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Bruno Díaz')).toBeInTheDocument();
    expect(screen.getByText('Linked to Corporate')).toBeInTheDocument();
    expect(screen.getByText('No signature yet')).toBeInTheDocument();
    expect(screen.getByText('Delegation is missing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Without a signature/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Recompile 1 outdated' })).toBeEnabled();

    const listing = calls.find((c) => c.url.includes('/admin/team'))!;
    expect(new URL(listing.url).searchParams.get('state')).toBe('all');
  });

  it('filters by state through the API', async () => {
    render(<TeamPage />);
    await screen.findByText('Ana Souza');

    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'outdated' } });

    await waitFor(() =>
      expect(
        calls.some((c) => c.url.includes('/admin/team') && c.url.includes('state=outdated')),
      ).toBe(true),
    );
  });

  it('recompiles outdated signatures with the owner’s render context', async () => {
    render(<TeamPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Recompile 1 outdated' }));

    expect(await screen.findByText('Done: 1 recompiled.')).toBeInTheDocument();
    const store = calls.find((c) => c.url.includes('/admin/signatures/30/html'))!;
    const sent = body(store);
    expect(String(sent.html)).toContain('Ana Souza');
    expect(String(sent.html)).toContain('lang="pt-BR"');
    expect(sent.expected_updated_at).toBe('2026-11-05 10:00:00');
    expect(sent.expected_inputs_hash).toBe('inputs-1');
    // The listing reloads afterwards.
    await waitFor(() =>
      expect(calls.filter((c) => c.url.includes('/admin/team')).length).toBeGreaterThan(1),
    );
  });

  it('copies a person’s install link from the row menu', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<TeamPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Ana Souza' }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: /Edit signature on their behalf/ }),
    ).toHaveAttribute(
      'href',
      'http://localhost/wp-admin/admin.php?page=imagina-signatures-editor&id=30',
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Copy install link/ }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://acme.test/signatures/install/abc/'),
    );
    expect(await screen.findByText(/Install link of Ana Souza copied/)).toBeInTheDocument();
  });

  it('invites the selected people who have a compiled signature', async () => {
    render(<TeamPage />);
    await screen.findByText('Ana Souza');

    fireEvent.click(screen.getByLabelText('Select everyone on this page'));
    const toolbar = screen.getByRole('toolbar', { name: 'Selected people' });
    expect(within(toolbar).getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(within(toolbar).getByRole('button', { name: /Send invitations/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/admin/deploy/invitations'))).toBe(true),
    );
    const sent = body(calls.find((c) => c.url.endsWith('/admin/deploy/invitations'))!);
    // Bruno has no signature: not invited.
    expect(sent).toMatchObject({ user_ids: [3] });
    expect(await screen.findByText(/1 invitation\(s\) queued/)).toBeInTheDocument();
  });
});
