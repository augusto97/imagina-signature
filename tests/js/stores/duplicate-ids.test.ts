import { describe, it, expect, beforeEach } from 'vitest';
import { useSchemaStore } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { cloneBlockWithFreshIds, collectBlockIds } from '@/stores/schemaUtils';
import { createEmptySchema } from '@/core/schema/signature';
import type { ContainerBlock, TextBlock } from '@/core/schema/blocks';

const txt = (id: string): TextBlock => ({
  id,
  type: 'text',
  content: id,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

const twoCol = (id: string, left: ContainerBlock['children'], right: ContainerBlock['children']): ContainerBlock => ({
  id,
  type: 'container',
  columns: 2,
  gap: 16,
  children: left,
  right_children: right,
});

describe('recursive id regeneration', () => {
  beforeEach(() => {
    const schema = createEmptySchema();
    schema.blocks.push(twoCol('cnt_1', [txt('txt_L')], [txt('txt_R'), twoCol('cnt_inner', [txt('txt_IL')], [txt('txt_IR')])]));
    useSchemaStore.setState({ schema, hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
  });

  it('cloneBlockWithFreshIds re-ids both cells at every depth', () => {
    const original = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    const copy = cloneBlockWithFreshIds(original);
    const before = collectBlockIds([original]);
    const after = collectBlockIds([copy]);
    expect(after).toHaveLength(before.length);
    for (const id of after) expect(before).not.toContain(id);
    expect(new Set(after).size).toBe(after.length);
    // Readable prefixes survive.
    expect(copy.id.startsWith('cnt_')).toBe(true);
  });

  it('duplicating a container gives right-cell children their own ids', () => {
    useSchemaStore.getState().duplicateBlock('cnt_1');
    const blocks = useSchemaStore.getState().schema.blocks;
    expect(blocks).toHaveLength(2);

    const ids = collectBlockIds(blocks);
    expect(new Set(ids).size).toBe(ids.length);

    // Editing a right-cell child of the COPY must not touch the original.
    const copy = blocks[1] as ContainerBlock;
    const copyRight = copy.right_children?.[0];
    expect(copyRight).toBeDefined();
    useSchemaStore.getState().updateBlock(copyRight!.id, { content: 'edited copy' });

    const original = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect((original.right_children?.[0] as TextBlock).content).toBe('txt_R');
    const updatedCopy = useSchemaStore.getState().schema.blocks[1] as ContainerBlock;
    expect((updatedCopy.right_children?.[0] as TextBlock).content).toBe('edited copy');
  });

  it('pasteBlock inserts a re-id\'d copy after the target (or at the end)', () => {
    const source = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    const pastedId = useSchemaStore.getState().pasteBlock(source, 'txt_L');
    const cnt = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['txt_L', pastedId]);

    const endId = useSchemaStore.getState().pasteBlock(txt('txt_L'), null);
    const top = useSchemaStore.getState().schema.blocks;
    expect(top[top.length - 1]?.id).toBe(endId);
    expect(endId).not.toBe('txt_L');

    const ids = collectBlockIds(top);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
