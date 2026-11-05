import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const render = vi.hoisted(() => ({
  impl: async (spec: { shape: string; size: number }) => ({
    src: `https://cdn.example/avatar-${spec.shape}-${spec.size}.png`,
    processed: { ...spec },
  }),
}));

vi.mock('@/core/blocks/avatar/processAvatar', () => ({
  renderAvatar: vi.fn((spec: { shape: string; size: number }) => render.impl(spec)),
  rememberAvatarSource: vi.fn(),
}));

import { useAvatarProcessing } from '@/core/blocks/avatar/useAvatarProcessing';
import { renderAvatar } from '@/core/blocks/avatar/processAvatar';
import { endHistoryBurst, useSchemaStore } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { AvatarBlock } from '@/core/schema/blocks';

/**
 * The avatar's rendered PNG follows the user's edits: discrete changes
 * land together with the rendered image in one undo step; a failed
 * render keeps the change (CSS rendering); undo never re-triggers a
 * render.
 */

const config = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
  .IMGSIG_EDITOR_CONFIG;

function seed(extra: Partial<AvatarBlock> = {}): void {
  const schema = createEmptySchema();
  schema.blocks.push({
    id: 'av',
    type: 'avatar',
    src: 'https://cdn.example/me.jpg',
    alt: 'Me',
    size: 64,
    ...extra,
  } as AvatarBlock);
  useSchemaStore.setState({ schema, hasUserEdited: false });
  useHistoryStore.setState({ past: [], future: [] });
  endHistoryBurst();
}

const current = (): AvatarBlock => useSchemaStore.getState().schema.blocks[0] as AvatarBlock;

function hook() {
  return renderHook(() =>
    useAvatarProcessing('av', (patch) => useSchemaStore.getState().updateBlock('av', patch)),
  );
}

beforeEach(() => {
  vi.mocked(renderAvatar).mockClear();
  render.impl = async (spec) => ({
    src: `https://cdn.example/avatar-${spec.shape}-${spec.size}.png`,
    processed: { ...spec } as never,
  });
});

afterEach(() => {
  delete config.uploadEnabled;
});

describe('useAvatarProcessing', () => {
  it('writes a new photo and its rendered PNG as ONE undo step', async () => {
    seed();
    const { result } = hook();
    act(() =>
      result.current.commitNow({
        source_url: 'https://cdn.example/new.jpg',
        src: 'https://cdn.example/new.jpg',
        processed: undefined,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(current()).toMatchObject({
      source_url: 'https://cdn.example/new.jpg',
      src: 'https://cdn.example/avatar-circle-64.png',
      processed: { source_url: 'https://cdn.example/new.jpg', shape: 'circle', size: 64 },
    });
    expect(useHistoryStore.getState().past).toHaveLength(1);

    act(() => {
      useSchemaStore.getState().undo();
    });
    expect(current().src).toBe('https://cdn.example/me.jpg');
    expect(current().source_url).toBeUndefined();
    expect(renderAvatar).toHaveBeenCalledTimes(1);
  });

  it('keeps the change and reports the error when rendering fails', async () => {
    seed({ source_url: 'https://cdn.example/me.jpg' });
    render.impl = async () => {
      throw new Error('CORS says no');
    };
    const { result } = hook();
    act(() => result.current.commitNow({ shape: 'rounded' }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('CORS says no');
    expect(current().shape).toBe('rounded');
    expect(current().src).toBe('https://cdn.example/me.jpg');
  });

  it('writes plainly when nothing needs rendering (pasted photo, default circle)', () => {
    seed();
    const { result } = hook();
    act(() => result.current.commitNow({ alt: 'Jane' }));
    expect(current().alt).toBe('Jane');
    expect(renderAvatar).not.toHaveBeenCalled();
  });

  it('does not render in URL-only mode', () => {
    config.uploadEnabled = false;
    seed({ source_url: 'https://cdn.example/me.jpg' });
    const { result } = hook();
    act(() => result.current.commitNow({ shape: 'square' }));
    act(() => result.current.commitLater({ ring_width: 2 }));
    expect(current()).toMatchObject({ shape: 'square', ring_width: 2 });
    expect(renderAvatar).not.toHaveBeenCalled();
  });

  it('applies continuous edits at once and re-renders after a pause', async () => {
    seed({ source_url: 'https://cdn.example/me.jpg' });
    const { result } = hook();
    act(() => result.current.commitLater({ size: 70 }));
    act(() => result.current.commitLater({ size: 96 }));
    expect(current().size).toBe(96);
    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(current().src).toBe('https://cdn.example/avatar-circle-96.png'), {
      timeout: 2000,
    });
    expect(renderAvatar).toHaveBeenCalledTimes(1);
  });

  it('drops a render whose settings were superseded, but keeps the superseded change', async () => {
    seed({ source_url: 'https://cdn.example/me.jpg' });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    render.impl = async (spec) => {
      if (spec.shape === 'rounded') await gate;
      return { src: `https://cdn.example/${spec.shape}.png`, processed: { ...spec } as never };
    };
    const { result } = hook();
    act(() => result.current.commitNow({ shape: 'rounded', alt: 'Kept' }));
    act(() => result.current.commitNow({ shape: 'square' }));
    await waitFor(() => expect(current().src).toBe('https://cdn.example/square.png'));
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(current()).toMatchObject({ shape: 'square', alt: 'Kept', src: 'https://cdn.example/square.png' });
  });
});
