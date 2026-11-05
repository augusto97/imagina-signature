import { beforeEach, describe, expect, it } from 'vitest';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import type { Block } from '@/core/schema/blocks';

const qr = (): Block =>
  ({ id: 'q', type: 'qr_code', data: 'https://a.example', size: 120, color: '#000000', background_color: '#ffffff' }) as unknown as Block;

describe('updateBlock({ history: false }) for derived writes', () => {
  beforeEach(() => {
    const store = useSchemaStore.getState();
    store.setSchema({
      schema_version: '1.1',
      meta: { created_at: '', updated_at: '', editor_version: 'test' },
      canvas: {
        width: 600,
        background_color: '#ffffff',
        font_family: 'Arial, sans-serif',
        font_size: 14,
        text_color: '#111827',
        link_color: '#1d4ed8',
      },
      blocks: [qr()],
      variables: {},
    } as never);
    useHistoryStore.getState().clear();
  });

  it('applies and saves the write without adding an undo step', () => {
    const store = useSchemaStore.getState();
    store.updateBlock('q', { data: 'https://b.example' } as Partial<Block>);
    const pastAfterUserEdit = useHistoryStore.getState().past.length;

    endHistoryBurst();
    store.updateBlock('q', { image_url: 'https://cdn.example/q.png' } as Partial<Block>, { history: false });

    expect(useHistoryStore.getState().past.length).toBe(pastAfterUserEdit);
    const block = useSchemaStore.getState().schema.blocks[0] as unknown as { image_url: string };
    expect(block.image_url).toBe('https://cdn.example/q.png');
    expect(useSchemaStore.getState().hasUserEdited).toBe(true);
  });

  it('a single undo goes back past the user edit, and redo restores both', () => {
    const store = useSchemaStore.getState();
    store.updateBlock('q', { data: 'https://b.example' } as Partial<Block>);
    endHistoryBurst();
    store.updateBlock('q', { image_url: 'https://cdn.example/q.png' } as Partial<Block>, { history: false });

    useSchemaStore.getState().undo();
    const undone = useSchemaStore.getState().schema.blocks[0] as unknown as { data: string; image_url?: string };
    expect(undone.data).toBe('https://a.example');
    expect(undone.image_url).toBeUndefined();

    useSchemaStore.getState().redo();
    const redone = useSchemaStore.getState().schema.blocks[0] as unknown as { data: string; image_url?: string };
    expect(redone.data).toBe('https://b.example');
    expect(redone.image_url).toBe('https://cdn.example/q.png');
  });
});
