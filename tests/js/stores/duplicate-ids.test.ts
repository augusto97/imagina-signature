import { describe, it, expect, beforeEach } from 'vitest';
import { useSchemaStore } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { cloneBlockWithFreshIds, collectBlockIds, collectColumnIds } from '@/stores/schemaUtils';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, ContainerBlock, TextBlock } from '@/core/schema/blocks';

const txt = (id: string): TextBlock => ({
  id,
  type: 'text',
  content: id,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

const twoCol = (id: string, left: Block[], right: Block[]): ContainerBlock => ({
  id,
  type: 'container',
  gap: 16,
  columns: [
    { id: `col_${id}_l`, width: 50, children: left },
    { id: `col_${id}_r`, width: 50, children: right },
  ],
});

const right = (c: Block | undefined): Block[] => (c as ContainerBlock).columns[1]!.children;

describe('recursive id regeneration', () => {
  beforeEach(() => {
    const schema = createEmptySchema();
    schema.blocks.push(
      twoCol('cnt_1', [txt('txt_L')], [txt('txt_R'), twoCol('cnt_inner', [txt('txt_IL')], [txt('txt_IR')])]),
    );
    useSchemaStore.setState({ schema, hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
  });

  it('cloneBlockWithFreshIds re-ids every column and block at every depth', () => {
    const original = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    const copy = cloneBlockWithFreshIds(original);
    const before = collectBlockIds([original]);
    const after = collectBlockIds([copy]);
    expect(after).toHaveLength(before.length);
    for (const id of after) expect(before).not.toContain(id);
    expect(new Set(after).size).toBe(after.length);

    const beforeCols = collectColumnIds([original]);
    const afterCols = collectColumnIds([copy]);
    expect(afterCols).toHaveLength(4);
    for (const id of afterCols) expect(beforeCols).not.toContain(id);
    // Readable prefixes survive.
    expect(copy.id.startsWith('cnt_')).toBe(true);
    expect(copy.columns[0]!.id.startsWith('col_')).toBe(true);
  });

  it('duplicating a container gives right-column children their own ids', () => {
    useSchemaStore.getState().duplicateBlock('cnt_1');
    const blocks = useSchemaStore.getState().schema.blocks;
    expect(blocks).toHaveLength(2);

    const ids = collectBlockIds(blocks);
    expect(new Set(ids).size).toBe(ids.length);
    const columnIds = collectColumnIds(blocks);
    expect(new Set(columnIds).size).toBe(columnIds.length);

    // Editing a right-column child of the COPY must not touch the original.
    const copyRight = right(blocks[1])[0];
    expect(copyRight).toBeDefined();
    useSchemaStore.getState().updateBlock(copyRight!.id, { content: 'edited copy' });

    expect((right(useSchemaStore.getState().schema.blocks[0])[0] as TextBlock).content).toBe('txt_R');
    expect((right(useSchemaStore.getState().schema.blocks[1])[0] as TextBlock).content).toBe(
      'edited copy',
    );
  });

  it("pasteBlock inserts a re-id'd copy after the target (or at the end)", () => {
    const leaf = txt('txt_X');
    const pastedId = useSchemaStore.getState().pasteBlock(leaf, 'txt_L');
    expect(pastedId).not.toBeNull();
    const cnt = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect(cnt.columns[0]!.children.map((c) => c.id)).toEqual(['txt_L', pastedId]);

    const endId = useSchemaStore.getState().pasteBlock(txt('txt_L'), null);
    const top = useSchemaStore.getState().schema.blocks;
    expect(top[top.length - 1]?.id).toBe(endId);
    expect(endId).not.toBe('txt_L');

    const ids = collectBlockIds(top);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
