import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportModal } from '@/editor/modals/ExportModal';
import { useEditorStore } from '@/stores/editorStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { createEmptySchema } from '@/core/schema/signature';
import { compileSignature } from '@/core/compiler/compile';
import type { AvatarBlock, ContainerBlock, ImageBlock, VCardBlock } from '@/core/schema/blocks';
import '@/core/blocks';

const API = 'http://localhost/wp-json/imagina-signatures/v1';
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let uploads: string[] = [];

beforeEach(() => {
  uploads = [];
  let id = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url === `${API}/upload/init`) {
        uploads.push(JSON.parse(String(init.body)).filename);
        return json({ method: 'direct', url: `${API}/upload/direct` });
      }
      if (url === `${API}/upload/direct`) {
        id += 1;
        return json({ id, public_url: `https://site.example/u/${id}` }, 201);
      }
      return json({}, 404);
    }),
  );

  const logo: ImageBlock = { id: 'logo', type: 'image', src: PNG, alt: 'Logo', width: 100 };
  const avatar: AvatarBlock = { id: 'av', type: 'avatar', src: PNG, alt: 'Me', size: 64 };
  const card: VCardBlock = {
    id: 'vc',
    type: 'vcard',
    label: 'Save my contact',
    full_name: 'Jane Doe',
    organization: '',
    title: '',
    email: 'jane@acme.example',
    phone: '',
    website: '',
    background_color: '#2563eb',
    text_color: '#ffffff',
    border_radius: 6,
  };
  const row: ContainerBlock = {
    id: 'row',
    type: 'container',
    gap: 16,
    columns: [
      { id: 'col_l', width: 50, children: [avatar] },
      { id: 'col_r', width: 50, children: [logo] },
    ],
  };
  const schema = createEmptySchema();
  schema.blocks = [row, card];
  useSchemaStore.setState({ schema });
  useEditorStore.setState({ modal: 'export' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useEditorStore.setState({ modal: null });
});

describe('Export → Fix embedded images', () => {
  it('flags data: images (also inside container cells) and un-hosted vCards', () => {
    render(<ExportModal />);
    expect(screen.getByText(/3 embedded images or files/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fix embedded images' })).toBeInTheDocument();
  });

  it('uploads every embedded asset and rewrites the blocks through updateBlock', async () => {
    render(<ExportModal />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fix embedded images' }));
    });

    await waitFor(() => expect(screen.queryByText(/embedded images? or files?/)).toBeNull());
    expect(uploads).toEqual(['avatar.png', 'image.png', 'jane-doe.vcf']);

    const { schema } = useSchemaStore.getState();
    const row = schema.blocks[0] as ContainerBlock;
    expect((row.columns[0]!.children[0] as AvatarBlock).src).toMatch(
      /^https:\/\/site\.example\/u\//,
    );
    expect((row.columns[1]!.children[0] as ImageBlock).src).toMatch(
      /^https:\/\/site\.example\/u\//,
    );
    expect((schema.blocks[1] as VCardBlock).vcf_url).toMatch(/^https:\/\/site\.example\/u\//);

    const result = compileSignature(schema);
    expect(result.html).not.toContain('data:');
    expect(result.errors).toEqual([]);
  });
});
