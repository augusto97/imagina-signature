import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProfileForm } from '@admin/components/ProfileForm';
import type { ProfilePayload } from '@admin/directoryTypes';

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

function payload(values: Record<string, string>): ProfilePayload {
  return {
    user_id: 5,
    user: { display_name: 'Jane Doe', email: 'jane@acme.com', avatar: '' },
    fields: [
      {
        key: 'job_title',
        label: 'Job title',
        type: 'text',
        custom: false,
        source: 'plugin',
        meta_key: '',
        readonly: false,
      },
      {
        key: 'phone',
        label: 'Phone',
        type: 'phone',
        custom: false,
        source: 'meta',
        meta_key: 'billing_phone',
        readonly: true,
      },
      {
        key: 'photo_url',
        label: 'Photo URL',
        type: 'url',
        custom: false,
        source: 'plugin',
        meta_key: '',
        readonly: false,
      },
      {
        key: 'employee_id',
        label: 'Employee ID',
        type: 'text',
        custom: true,
        source: 'plugin',
        meta_key: '',
        readonly: false,
      },
    ],
    values: { job_title: '', phone: '+34 911 222 333', photo_url: '', employee_id: '', ...values },
    groups: [{ id: 3, name: 'Sales', color: '#2563eb' }],
  };
}

beforeEach(() => {
  (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
    page: 'profile',
    userId: 5,
    capabilities: { use: true, manage_templates: false, manage_storage: false },
    apiBase: API,
    restNonce: 'admin-nonce',
    locale: 'en_US',
    wpAdminUrl: 'http://localhost/wp-admin/',
    urls: { signatures: '', templates: '', settings: '', editor: '', profile: '' },
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
});

describe('ProfileForm', () => {
  it('renders the fields, with mapped ones read-only, and the groups', async () => {
    responder = () => json(payload({ job_title: 'CTO' }));
    render(<ProfileForm endpoint="/me/profile" />);

    const title = await screen.findByLabelText(/Job title/);
    expect(title).toHaveValue('CTO');
    expect(title).toBeEnabled();

    const phone = screen.getByLabelText(/Phone/);
    expect(phone).toBeDisabled();
    expect(phone).toHaveValue('+34 911 222 333');
    expect(screen.getByText(/Synced from “billing_phone”/)).toBeInTheDocument();

    expect(screen.getByText('Employee ID')).toBeInTheDocument();
    expect(screen.getByText('{{employee_id}}')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(calls[0]!.url).toBe(`${API}/me/profile`);
  });

  it('saves only the changed editable fields and shows the server result', async () => {
    responder = (call) => {
      if (call.init.method === 'PATCH') {
        return json({
          ...payload({ job_title: 'Head of Sales', employee_id: 'E-7' }),
          saved: { changed: ['job_title', 'employee_id'], ignored: [] },
        });
      }
      return json(payload({ job_title: 'CTO' }));
    };
    const onSaved = vi.fn();
    render(<ProfileForm endpoint="/admin/users/5/profile" onSaved={onSaved} />);

    const save = await screen.findByRole('button', { name: /save profile/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: ' Head of Sales ' } });
    fireEvent.change(screen.getByLabelText(/Employee ID/), { target: { value: 'E-7' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await screen.findByText('Profile saved.');
    const patch = calls.find((c) => c.init.method === 'PATCH')!;
    expect(patch.url).toBe(`${API}/admin/users/5/profile`);
    expect(JSON.parse(String(patch.init.body))).toEqual({
      values: { job_title: ' Head of Sales ', employee_id: 'E-7' },
    });
    // The server's sanitised value replaces the draft.
    expect(screen.getByLabelText(/Job title/)).toHaveValue('Head of Sales');
    expect(onSaved).toHaveBeenCalledOnce();
    expect(save).toBeDisabled();
  });

  it('uploads a photo through the shared uploader', async () => {
    responder = (call) => {
      if (call.url === `${API}/upload/init`)
        return json({ method: 'direct', url: `${API}/upload/direct` });
      if (call.url === `${API}/upload/direct`) {
        return json({ id: 9, public_url: 'https://cdn.acme.com/jane.png' }, 201);
      }
      return json(payload({}));
    };
    render(<ProfileForm endpoint="/me/profile" />);

    const input = (await screen.findByTestId('profile-photo-input')) as HTMLInputElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'jane.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByLabelText(/Photo URL/)).toHaveValue('https://cdn.acme.com/jane.png'),
    );
    expect(screen.getByRole('button', { name: /save profile/i })).toBeEnabled();
  });

  it('shows the load error', async () => {
    responder = () => json({ code: 'imgsig_forbidden', message: 'Nope' }, 403);
    render(<ProfileForm endpoint="/admin/users/9/profile" />);
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });
});
