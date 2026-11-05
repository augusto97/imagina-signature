import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TemplatesPage } from '@admin/pages/TemplatesPage';

const API = 'http://localhost/wp-json/imagina-signatures/v1';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const template = {
  id: 4,
  slug: 'corp',
  name: 'Corporate',
  category: 'general',
  description: null,
  preview_url: null,
  json_content: {
    schema_version: '1.1',
    meta: {},
    canvas: {},
    blocks: [],
    variables: {},
    settings: { employee_mode: 'locked_design' },
  },
  is_system: false,
  sort_order: 0,
  schema_version: '1.1',
  visible_to_roles: [],
  created_at: '2026-11-05 10:00:00',
};

/** The dialog's "Apply" (the template card has one too). */
function submitButton(): HTMLElement {
  const buttons = screen.getAllByRole('button', { name: 'Apply' });
  return buttons[buttons.length - 1]!;
}

function body(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body ?? '{}')) as Record<string, unknown>;
}

beforeEach(() => {
  (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
    page: 'templates',
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
      const call = { url: String(url), init };
      calls.push(call);
      if (call.url.includes('/assign')) {
        const offset = Number(body(call).offset ?? 0);
        return json({
          template_id: 4,
          processed: offset === 0 ? 50 : 20,
          created: offset === 0 ? 48 : 20,
          updated: offset === 0 ? 2 : 0,
          skipped: 0,
          failed: 0,
          total: 70,
          next_offset: offset === 0 ? 50 : null,
        });
      }
      if (call.url.includes('/templates/4') && call.init.method === 'PATCH') {
        return json({
          ...template,
          propagation: { template_id: 4, status: 'done', total: 3, processed: 3, updated: 3 },
        });
      }
      return json([template]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
});

describe('Templates page — Apply', () => {
  it('assigns in chunks until next_offset is null and reports the totals', async () => {
    render(<TemplatesPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Apply/ }));
    fireEvent.click(screen.getByLabelText(/Linked \(recommended\)/));
    fireEvent.click(submitButton());

    await screen.findByRole('button', { name: 'Done' });
    const assigns = calls.filter((c) => c.url.includes('/admin/templates/4/assign'));
    expect(assigns).toHaveLength(2);
    expect(body(assigns[0]!)).toMatchObject({
      all: true,
      mode: 'linked',
      make_primary: true,
      offset: 0,
    });
    expect(body(assigns[1]!)).toMatchObject({ offset: 50 });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText(/70 of 70 users/)).toBeInTheDocument();
  });

  it('sends copy mode and explicit users without making them primary', async () => {
    render(<TemplatesPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Apply/ }));
    fireEvent.click(screen.getByLabelText(/Specific user IDs/));
    fireEvent.change(screen.getByPlaceholderText('1, 2, 3'), { target: { value: '7, 8' } });
    fireEvent.click(screen.getByLabelText(/^Copy/));
    fireEvent.click(screen.getByLabelText(/primary signature/));
    fireEvent.click(submitButton());

    await screen.findByRole('button', { name: 'Done' });
    expect(body(calls.find((c) => c.url.includes('/assign'))!)).toMatchObject({
      user_ids: [7, 8],
      mode: 'copy',
      make_primary: false,
    });
  });
});

describe('Templates page — employee mode', () => {
  it('shows the mode on the card and patches settings.employee_mode', async () => {
    render(<TemplatesPage />);
    expect(await screen.findByText('Locked design')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    fireEvent.change(screen.getByDisplayValue('Locked design'), {
      target: { value: 'fields_only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByText(/3 linked signatures were updated/)).toBeInTheDocument(),
    );
    const patch = calls.find((c) => c.init.method === 'PATCH')!;
    expect(body(patch)).toMatchObject({
      json_content: { settings: { employee_mode: 'fields_only' } },
    });
  });

  it('a metadata-only edit leaves the design alone', async () => {
    render(<TemplatesPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true));
    expect(body(calls.find((c) => c.init.method === 'PATCH')!)).not.toHaveProperty('json_content');
  });
});
