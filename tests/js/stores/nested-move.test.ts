import { describe, it, expect, beforeEach } from 'vitest';
import { useSchemaStore } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { TextBlock, ContainerBlock } from '@/core/schema/blocks';

/**
 * Regressions for nested-block schema mutations. Until 1.0.25 the
 * insertBlockAfter / moveBlock / duplicateBlock actions only operated
 * on the top-level `state.schema.blocks` array. Dragging or
 * duplicating a block that lived inside a Container produced one of:
 *   - silent no-op (source not found at top level)
 *   - schema corruption (`splice(-1, 1)` removed the LAST top-level
 *     block when the source resolved to index -1)
 */

const txt = (id: string): TextBlock => ({
  id,
  type: 'text',
  content: id,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

const containerWith = (id: string, children: TextBlock[]): ContainerBlock => ({
  id,
  type: 'container',
  columns: 1,
  gap: 0,
  children,
});

describe('schemaStore: nested mutations walk into Container children', () => {
  beforeEach(() => {
    useSchemaStore.setState({ schema: createEmptySchema(), hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
  });

  it('insertBlockAfter into a nested target inserts in the parent container', () => {
    useSchemaStore.setState((s) => {
      const schema = createEmptySchema();
      schema.blocks.push(containerWith('cnt', [txt('a'), txt('b')]));
      return { schema, hasUserEdited: s.hasUserEdited };
    });

    useSchemaStore.getState().insertBlockAfter('a', txt('new'));

    const top = useSchemaStore.getState().schema.blocks;
    expect(top).toHaveLength(1);
    const cnt = top[0] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['a', 'new', 'b']);
  });

  it('moveBlock can reorder a nested block inside its parent', () => {
    useSchemaStore.setState((s) => {
      const schema = createEmptySchema();
      schema.blocks.push(containerWith('cnt', [txt('a'), txt('b'), txt('c')]));
      return { schema, hasUserEdited: s.hasUserEdited };
    });

    useSchemaStore.getState().moveBlock('a', 'c', 'after');

    const cnt = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('moveBlock with a missing target does NOT corrupt the schema', () => {
    useSchemaStore.setState((s) => {
      const schema = createEmptySchema();
      schema.blocks.push(txt('a'), txt('b'), txt('c'));
      return { schema, hasUserEdited: s.hasUserEdited };
    });

    useSchemaStore.getState().moveBlock('a', 'does-not-exist', 'after');

    // Source should be re-inserted where it was rather than splice(-1)
    // wiping the last top-level block (the pre-1.0.25 corruption).
    const ids = useSchemaStore.getState().schema.blocks.map((b) => b.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('duplicateBlock of a nested block inserts the copy next to the original', () => {
    useSchemaStore.setState((s) => {
      const schema = createEmptySchema();
      schema.blocks.push(containerWith('cnt', [txt('a'), txt('b')]));
      return { schema, hasUserEdited: s.hasUserEdited };
    });

    useSchemaStore.getState().duplicateBlock('a');

    const cnt = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect(cnt.children).toHaveLength(3);
    expect(cnt.children[0]?.id).toBe('a');
    expect(cnt.children[1]?.id).not.toBe('a'); // fresh id for the clone
    expect(cnt.children[2]?.id).toBe('b');
  });
});
