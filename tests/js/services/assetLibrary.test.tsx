import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/services/imageDecode', () => ({
  decodeImageBlob: vi.fn(),
  loadImageForCanvas: vi.fn(),
  probeImageSize: vi.fn(async () => ({ width: 640, height: 320 })),
}));

import {
  assetFilename,
  deleteAsset,
  fetchAssetPage,
  filterAssets,
  formatBytes,
  toLibraryAsset,
  type LibraryAsset,
} from '@/services/assets';
import { useAssetLibrary } from '@/services/useAssetLibrary';
import { AssetLibraryModal } from '@/editor/modals/AssetLibraryModal';

const API = 'http://localhost/wp-json/imagina-signatures/v1';
const config = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
  .IMGSIG_EDITOR_CONFIG;

type Call = { url: string; method: string };
let calls: Call[] = [];
let rows: Array<Record<string, unknown>> = [];
let failDelete = false;

function row(id: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    user_id: 1,
    storage_driver: 'media_library',
    storage_key: String(id),
    public_url: `https://site.example/wp-content/uploads/imagina-signatures/${id}-logo.png`,
    mime_type: 'image/png',
    size_bytes: 2048 * id,
    width: 100 * id,
    height: 50 * id,
    hash_sha256: 'x'.repeat(64),
    created_at: '2026-11-01 10:00:00',
    ...extra,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  calls = [];
  failDelete = false;
  rows = [row(1), row(2), row(3, { mime_type: 'text/vcard', public_url: 'https://site.example/c.vcf' })];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({ url, method });
      const list = /\/assets\?page=(\d+)&per_page=(\d+)$/.exec(url);
      if (list && method === 'GET') {
        const page = Number(list[1]);
        const per = Number(list[2]);
        return json(rows.slice((page - 1) * per, page * per));
      }
      if (url === `${API}/upload/init`) return json({ method: 'direct', url: `${API}/upload/direct` });
      if (url === `${API}/upload/direct`) {
        const name = ((init.body as FormData).get('file') as File).name;
        return json({ id: 100 + calls.length, public_url: `https://site.example/u/${name}` }, 201);
      }
      const del = /\/assets\/(\d+)$/.exec(url);
      if (del && method === 'DELETE') {
        if (failDelete) return json({ code: 'imgsig_not_found', message: 'Asset not found.' }, 404);
        rows = rows.filter((r) => r.id !== Number(del[1]));
        return json({ deleted: true });
      }
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete config.uploadEnabled;
});

describe('asset service', () => {
  it('normalises REST rows and derives the filename from the URL', () => {
    const asset = toLibraryAsset(row(4, { public_url: 'https://cdn.example/a/b/My%20Logo.png?v=2' }));
    expect(asset).toMatchObject({
      id: 4,
      mime: 'image/png',
      size: 8192,
      width: 400,
      height: 200,
      filename: 'My Logo.png',
    });
    expect(toLibraryAsset({ id: 0, public_url: 'x' })).toBeNull();
    expect(toLibraryAsset({ id: 5, public_url: '' })).toBeNull();
    expect(toLibraryAsset({ id: 6, public_url: 'https://x/y.png', width: null })!.width).toBeNull();
    expect(assetFilename('https://x.example/')).toBe('x.example');
  });

  it('fetches a page, keeps only images and infers "has more" from a full page', async () => {
    const page = await fetchAssetPage(1, 2);
    expect(calls[0]).toEqual({ url: `${API}/assets?page=1&per_page=2`, method: 'GET' });
    expect(page.items.map((a) => a.id)).toEqual([1, 2]);
    expect(page.hasMore).toBe(true);

    const second = await fetchAssetPage(2, 2);
    expect(second.items).toEqual([]); // the vCard is filtered out
    expect(second.rawCount).toBe(1);
    expect(second.hasMore).toBe(false);
  });

  it('deletes through DELETE /assets/:id', async () => {
    await deleteAsset(2);
    expect(calls).toEqual([{ url: `${API}/assets/2`, method: 'DELETE' }]);
  });

  it('searches by name, format and dimensions', () => {
    const items = [row(1), row(2, { mime_type: 'image/jpeg', public_url: 'https://x/team-photo.jpg' })]
      .map(toLibraryAsset)
      .filter((a): a is LibraryAsset => a !== null);
    expect(filterAssets(items, 'logo').map((a) => a.id)).toEqual([1]);
    expect(filterAssets(items, 'JPG').map((a) => a.id)).toEqual([2]);
    expect(filterAssets(items, 'jpeg').map((a) => a.id)).toEqual([2]);
    expect(filterAssets(items, '200x100').map((a) => a.id)).toEqual([2]);
    expect(filterAssets(items, 'team photo').map((a) => a.id)).toEqual([2]);
    expect(filterAssets(items, '  ')).toHaveLength(2);
  });

  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(812)).toBe('812 B');
    expect(formatBytes(24_576)).toBe('24 KB');
    expect(formatBytes(1_468_006)).toBe('1.4 MB');
  });
});

describe('useAssetLibrary', () => {
  it('loads when enabled, appends further pages without duplicates', async () => {
    rows = [row(1), row(2), row(3), row(4), row(5)];
    const { result } = renderHook(() => useAssetLibrary(true, 2));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items.map((a) => a.id)).toEqual([1, 2]);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(4));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(5));
    expect(result.current.items.map((a) => a.id)).toEqual([1, 2, 3, 4, 5]);
    expect(result.current.hasMore).toBe(false);
  });

  it('does not skip rows after a delete shifted the server pages', async () => {
    rows = [row(1), row(2), row(3), row(4), row(5)];
    const { result } = renderHook(() => useAssetLibrary(true, 2));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.remove(1));
    expect(result.current.items.map((a) => a.id)).toEqual([2]);
    // Server rows are now [2,3,4,5]: page 1 is re-read (3 is new), then page 2.
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items.map((a) => a.id)).toEqual([2, 3]));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items.map((a) => a.id)).toEqual([2, 3, 4, 5]));
  });

  it('does nothing while disabled', () => {
    renderHook(() => useAssetLibrary(false));
    expect(calls).toEqual([]);
  });

  it('keeps the list when the server refuses a delete', async () => {
    const { result } = renderHook(() => useAssetLibrary(true));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    failDelete = true;
    await expect(result.current.remove(1)).rejects.toThrow('Asset not found.');
    expect(result.current.items.map((a) => a.id)).toEqual([1, 2]);
  });

  it('prepends added assets once', async () => {
    const { result } = renderHook(() => useAssetLibrary(true));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const fresh = toLibraryAsset(row(9))!;
    act(() => result.current.add(fresh));
    act(() => result.current.add(fresh));
    expect(result.current.items.map((a) => a.id)).toEqual([9, 1, 2]);
  });

  it('reports load errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ code: 'rest_forbidden', message: 'Nope.' }, 403)));
    const { result } = renderHook(() => useAssetLibrary(true));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Nope.');
  });
});

describe('AssetLibraryModal', () => {
  it('lists images, searches, and returns the chosen asset with its size', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<AssetLibraryModal open onClose={onClose} onSelect={onSelect} />);
    const grid = await screen.findByRole('list', { name: 'Your images' });
    expect(within(grid).getAllByRole('button', { pressed: false })).toHaveLength(2);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search images' }), {
      target: { value: '2-logo' },
    });
    const tiles = within(grid).getAllByRole('button', { pressed: false });
    expect(tiles).toHaveLength(1);

    fireEvent.click(tiles[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Use image' }));
    expect(onSelect).toHaveBeenCalledWith({
      url: 'https://site.example/wp-content/uploads/imagina-signatures/2-logo.png',
      width: 200,
      height: 100,
      assetId: 2,
      mime: 'image/png',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('deletes after confirmation', async () => {
    render(<AssetLibraryModal open onClose={() => {}} onSelect={() => {}} />);
    await screen.findByRole('list', { name: 'Your images' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete image' })[0]!);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls.some((c) => c.method === 'DELETE' && c.url === `${API}/assets/1`)).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Delete image' })).toHaveLength(1);
  });

  it('uploads several dropped / picked files one at a time and selects the last', async () => {
    const onSelect = vi.fn();
    render(<AssetLibraryModal open onClose={() => {}} onSelect={onSelect} filenameBase="logo" />);
    await screen.findByRole('list', { name: 'Your images' });
    const gif = (name: string) =>
      new File([new Uint8Array([71, 73, 70, 56, 57, 97, 10, 0, 5, 0])], name, { type: 'image/gif' });
    await act(async () => {
      fireEvent.change(screen.getByTestId('asset-library-file-input'), {
        target: { files: [gif('Spring Sale.gif'), gif('promo.gif')] },
      });
    });
    await waitFor(() => expect(screen.getAllByText('Uploaded')).toHaveLength(2));
    const inits = calls.filter((c) => c.url === `${API}/upload/init`);
    expect(inits).toHaveLength(2);
    // Newest first, last upload selected.
    const grid = screen.getByRole('list', { name: 'Your images' });
    expect(within(grid).getAllByRole('button', { pressed: true })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Use image' }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://site.example/u/promo.gif', width: 10, height: 5 }),
    );
  });

  it('in URL-only mode shows a notice instead of the upload zone and keeps URL pasting', async () => {
    config.uploadEnabled = false;
    const onSelect = vi.fn();
    render(<AssetLibraryModal open onClose={() => {}} onSelect={onSelect} />);
    expect(screen.getByRole('note')).toHaveTextContent(/Uploads are disabled/);
    expect(screen.queryByText('Choose files')).toBeNull();
    expect(screen.queryByTestId('asset-library-file-input')).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: 'Image URL' }), {
      target: { value: 'https://cdn.example/banner.png' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use URL' }));
    });
    expect(onSelect).toHaveBeenCalledWith({
      url: 'https://cdn.example/banner.png',
      width: 640,
      height: 320,
    });
  });

  it('rejects a URL that is not http(s)', async () => {
    const onSelect = vi.fn();
    render(<AssetLibraryModal open onClose={() => {}} onSelect={onSelect} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Image URL' }), {
      target: { value: 'javascript:alert(1)' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use URL' }));
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/https:\/\//);
  });
});
