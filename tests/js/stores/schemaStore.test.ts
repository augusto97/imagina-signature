import { describe, it, expect, beforeEach } from 'vitest';
import { useSchemaStore } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';

const sample = (id: string, content = ''): TextBlock => ({
  id,
  type: 'text',
  content,
  style: {
    font_family: 'Arial',
    font_size: 14,
    font_weight: 400,
    color: '#000',
  },
});

describe('schemaStore', () => {
  beforeEach(() => {
    useSchemaStore.setState({ schema: createEmptySchema() });
    useHistoryStore.setState({ past: [], future: [] });
  });

  it('addBlock appends to the end and pushes a history snapshot', () => {
    useSchemaStore.getState().addBlock(sample('a'));
    useSchemaStore.getState().addBlock(sample('b'));

    const ids = useSchemaStore.getState().schema.blocks.map((b) => b.id);
    expect(ids).toEqual(['a', 'b']);
    expect(useHistoryStore.getState().past.length).toBe(2);
  });

  it('updateBlock mutates fields without pushing history', () => {
    useSchemaStore.getState().addBlock(sample('a'));
    useHistoryStore.setState({ past: [], future: [] });

    useSchemaStore.getState().updateBlock('a', { content: 'changed' });

    const block = useSchemaStore.getState().schema.blocks[0] as TextBlock;
    expect(block.content).toBe('changed');
    expect(useHistoryStore.getState().past.length).toBe(0);
  });

  it('moveBlock reorders to "before" / "after" target', () => {
    useSchemaStore.getState().addBlock(sample('a'));
    useSchemaStore.getState().addBlock(sample('b'));
    useSchemaStore.getState().addBlock(sample('c'));

    useSchemaStore.getState().moveBlock('a', 'c', 'after');

    expect(useSchemaStore.getState().schema.blocks.map((b) => b.id)).toEqual(['b', 'c', 'a']);
  });

  it('deleteBlock removes the targeted block', () => {
    useSchemaStore.getState().addBlock(sample('a'));
    useSchemaStore.getState().addBlock(sample('b'));

    useSchemaStore.getState().deleteBlock('a');

    expect(useSchemaStore.getState().schema.blocks.map((b) => b.id)).toEqual(['b']);
  });

  it('duplicateBlock inserts a clone right after the original', () => {
    useSchemaStore.getState().addBlock(sample('a', 'orig'));

    useSchemaStore.getState().duplicateBlock('a');

    const blocks = useSchemaStore.getState().schema.blocks;
    expect(blocks).toHaveLength(2);
    expect((blocks[1] as TextBlock).content).toBe('orig');
    expect(blocks[1]?.id).not.toBe('a');
  });
});
