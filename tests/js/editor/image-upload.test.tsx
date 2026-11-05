import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageUploadButton } from '@/core/blocks/image/definition';

const API = 'http://localhost/wp-json/imagina-signatures/v1';
const config = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
  .IMGSIG_EDITOR_CONFIG;

afterEach(() => {
  vi.unstubAllGlobals();
  delete config.uploadEnabled;
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ImageUploadButton', () => {
  it('uploads a picked GIF untouched (keeps animation) and returns the hosted URL', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === `${API}/upload/init`)
        return json({ method: 'direct', url: `${API}/upload/direct` });
      return json({ id: 5, public_url: 'https://site.example/u/anim.gif' }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onUploaded = vi.fn();

    const { container } = render(
      <ImageUploadButton displayWidth={300} filenameBase="banner" onUploaded={onUploaded} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const gif = new File([new Uint8Array([71, 73, 70, 56, 57, 97])], 'anim.gif', {
      type: 'image/gif',
    });
    fireEvent.change(input, { target: { files: [gif] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(onUploaded.mock.calls[0]![0]).toBe('https://site.example/u/anim.gif');
    const init = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(init).toMatchObject({ filename: 'banner.gif', mime_type: 'image/gif', size_bytes: 6 });
  });

  it('is hidden in URL-only mode', () => {
    config.uploadEnabled = false;
    render(<ImageUploadButton displayWidth={300} filenameBase="x" onUploaded={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
