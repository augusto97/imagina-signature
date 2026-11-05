import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SaveAsTemplateModal } from '@/editor/modals/SaveAsTemplateModal';
import { useSchemaStore } from '@/stores/schemaStore';
import { useLinkStore } from '@/stores/linkStore';
import { useToastStore } from '@/stores/toastStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const body = (call: Call): Record<string, unknown> =>
  JSON.parse(String(call.init.body ?? '{}')) as Record<string, unknown>;

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/templates?')) {
        return json([
          { id: 4, name: 'Corporate' },
          { id: 9, name: 'Sales' },
        ]);
      }
      if (init.method === 'PATCH') {
        return json({ id: 4, propagation: { status: 'done', total: 12, updated: 12 } });
      }
      return json({ id: 10 });
    }),
  );
  const schema = createEmptySchema();
  schema.blocks = [
    { id: 'a', type: 'text', content: '<p>A</p>', style: {}, locked: true } as TextBlock,
    { id: 'b', type: 'text', content: '<p>Mine</p>', style: {} } as TextBlock,
  ];
  schema.overrides = { b: { content: '<p>Mine</p>' } };
  useSchemaStore.setState({ schema, hasUserEdited: false });
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useLinkStore.getState().reset();
});

describe('Save as template — employee mode and updating a template', () => {
  it('a linked signature updates its template with the chosen mode and without overrides', async () => {
    useLinkStore.setState({
      mode: 'linked',
      templateId: 4,
      employeeMode: 'free',
      canBypassLocks: true,
    });
    render(<SaveAsTemplateModal open onClose={() => {}} />);

    expect(screen.getByText('1 block is locked.', { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue('Corporate')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('Free'), { target: { value: 'locked_design' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update template' }));

    await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.init.method === 'PATCH')!;
    expect(patch.url).toMatch(/\/templates\/4$/);
    const sent = body(patch).json_content as Record<string, unknown>;
    expect(sent.settings).toEqual({ employee_mode: 'locked_design' });
    expect(sent).not.toHaveProperty('overrides');
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
        'Template updated. 12 linked signatures were refreshed.',
      ),
    );
  });

  it('a new template carries the employee mode', async () => {
    render(<SaveAsTemplateModal open onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Sales — active'), {
      target: { value: 'Field team' },
    });
    fireEvent.change(screen.getByDisplayValue('Free'), { target: { value: 'fields_only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));

    await waitFor(() => expect(calls.some((c) => c.init.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.init.method === 'POST')!;
    expect(body(post)).toMatchObject({ name: 'Field team', slug: 'field-team' });
    expect((body(post).json_content as { settings: unknown }).settings).toEqual({
      employee_mode: 'fields_only',
    });
  });
});
