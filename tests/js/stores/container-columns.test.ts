import { describe, it, expect, beforeEach } from 'vitest';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { collectBlockIds, collectColumnIds } from '@/stores/schemaUtils';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block, ContainerBlock } from '@/core/schema/blocks';
import { container, ids, text } from '../fixtures/containers';

/**
 * Container v2 store actions on 3- and 4-column containers: routing
 * into columns, moves between columns, column count / layout changes
 * that never lose blocks, width fine-tuning, column reorder / styling,
 * recursive re-id on duplicate and the one-level nesting limit.
 */

function seed(...blocks: Block[]): void {
  const schema = createEmptySchema();
  schema.blocks.push(...blocks);
  useSchemaStore.setState({ schema, hasUserEdited: false });
  useHistoryStore.setState({ past: [], future: [] });
  endHistoryBurst();
}

const top = (): Block[] => useSchemaStore.getState().schema.blocks;
const row = (index = 0): ContainerBlock => top()[index] as ContainerBlock;
const widths = (c: ContainerBlock): number[] => c.columns.map((col) => col.width);
const store = () => useSchemaStore.getState();

describe('container columns: routing and moves', () => {
  beforeEach(() => {
    seed(container('cnt', [[text('A'), text('B')], [text('C')], [text('D')]]));
  });

  it('addChildToColumn routes to the requested column and position', () => {
    expect(store().addChildToColumn('cnt', 'cnt-c2', text('E'))).toBe(true);
    expect(store().addChildToColumn('cnt', 'cnt-c1', text('F'), 0)).toBe(true);
    expect(ids(row(), 0)).toEqual(['A', 'B']);
    expect(ids(row(), 1)).toEqual(['F', 'C']);
    expect(ids(row(), 2)).toEqual(['D', 'E']);
    expect(store().addChildToColumn('cnt', 'missing', text('G'))).toBe(false);
  });

  it('moveBlockToColumn moves a block from the first to the third column', () => {
    expect(store().moveBlockToColumn('A', 'cnt', 'cnt-c2')).toBe(true);
    expect(ids(row(), 0)).toEqual(['B']);
    expect(ids(row(), 2)).toEqual(['D', 'A']);

    // Within the same column, at an explicit position.
    expect(store().moveBlockToColumn('A', 'cnt', 'cnt-c2', 0)).toBe(true);
    expect(ids(row(), 2)).toEqual(['A', 'D']);
    expect(useHistoryStore.getState().past).toHaveLength(2);
  });

  it('moveBlock lands before / after a block in another column', () => {
    expect(store().moveBlock('B', 'D', 'before')).toBe(true);
    expect(ids(row(), 0)).toEqual(['A']);
    expect(ids(row(), 2)).toEqual(['B', 'D']);
    expect(store().moveBlock('C', 'B', 'after')).toBe(true);
    expect(ids(row(), 1)).toEqual([]);
    expect(ids(row(), 2)).toEqual(['B', 'C', 'D']);
  });

  it('refuses to move a container into one of its own columns', () => {
    expect(store().moveBlockToColumn('cnt', 'cnt', 'cnt-c0')).toBe(false);
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });
});

describe('container columns: count and layout changes never lose blocks', () => {
  beforeEach(() => {
    seed(
      container('cnt', [[text('A')], [text('B')], [text('C'), text('D')], [text('E')]], {
        widths: [25, 25, 25, 25],
      }),
    );
  });

  it('4 → 2 columns moves the removed columns’ blocks into the last kept column', () => {
    const before = collectBlockIds(top());
    store().setContainerColumns('cnt', 2);
    expect(row().columns).toHaveLength(2);
    expect(ids(row(), 0)).toEqual(['A']);
    expect(ids(row(), 1)).toEqual(['B', 'C', 'D', 'E']);
    expect(widths(row())).toEqual([50, 50]);
    expect(collectBlockIds(top()).sort()).toEqual(before.sort());
  });

  it('1 column keeps every block, in order', () => {
    store().setContainerColumns('cnt', 1);
    expect(row().columns).toHaveLength(1);
    expect(ids(row(), 0)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(widths(row())).toEqual([100]);
  });

  it('adding columns appends empty ones with an even split; count is clamped to 4', () => {
    store().setContainerColumns('cnt', 1);
    store().setContainerColumns('cnt', 3);
    expect(row().columns).toHaveLength(3);
    expect(ids(row(), 0)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(ids(row(), 1)).toEqual([]);
    expect(widths(row())).toEqual([33, 33, 34]);
    expect(widths(row()).reduce((a, b) => a + b, 0)).toBe(100);

    store().setContainerColumns('cnt', 9);
    expect(row().columns).toHaveLength(4);
  });

  it('removeContainerColumn hands blocks to the previous column (or the next for the first)', () => {
    store().removeContainerColumn('cnt', 'cnt-c2');
    expect(row().columns.map((c) => c.id)).toEqual(['cnt-c0', 'cnt-c1', 'cnt-c3']);
    expect(ids(row(), 1)).toEqual(['B', 'C', 'D']);
    expect(widths(row())).toEqual([25, 50, 25]);

    store().removeContainerColumn('cnt', 'cnt-c0');
    expect(ids(row(), 0)).toEqual(['A', 'B', 'C', 'D']);
    expect(widths(row())).toEqual([75, 25]);

    store().removeContainerColumn('cnt', 'cnt-c1');
    store().removeContainerColumn('cnt', 'cnt-c3');
    expect(row().columns).toHaveLength(1);
    expect(collectBlockIds(top())).toHaveLength(6);
  });

  it('setContainerLayout applies a preset and changes the column count', () => {
    store().setContainerLayout('cnt', [25, 50, 25]);
    expect(widths(row())).toEqual([25, 50, 25]);
    expect(ids(row(), 2)).toEqual(['C', 'D', 'E']);
    expect(row().columns[0]!.id).toBe('cnt-c0'); // existing columns keep their ids
  });

  it('undo restores the columns removed by a count change', () => {
    store().setContainerColumns('cnt', 2);
    expect(store().undo()).toBe(true);
    expect(row().columns).toHaveLength(4);
    expect(ids(row(), 2)).toEqual(['C', 'D']);
  });
});

describe('container columns: widths, order and styling', () => {
  beforeEach(() => {
    seed(container('cnt', [[text('A')], [text('B')], [text('C')]], { widths: [33, 33, 34] }));
  });

  it('setColumnWidths normalises to 100 and coalesces rapid edits into one undo step', () => {
    store().setColumnWidths('cnt', [20, 40, 40]);
    store().setColumnWidths('cnt', [30, 30, 60]);
    expect(widths(row())).toEqual([25, 25, 50]);
    expect(useHistoryStore.getState().past).toHaveLength(1);
    store().undo();
    expect(widths(row())).toEqual([33, 33, 34]);
  });

  it('moveContainerColumn swaps neighbours (children travel with their column)', () => {
    store().moveContainerColumn('cnt', 'cnt-c0', 1);
    expect(row().columns.map((c) => c.id)).toEqual(['cnt-c1', 'cnt-c0', 'cnt-c2']);
    expect(ids(row(), 1)).toEqual(['A']);
    store().moveContainerColumn('cnt', 'cnt-c2', 1); // already last: no-op
    expect(useHistoryStore.getState().past).toHaveLength(1);
  });

  it('updateContainerColumn sets / clears valign and box', () => {
    store().updateContainerColumn('cnt', 'cnt-c1', {
      valign: 'middle',
      box: { background_color: '#eef2ff', border_radius: 8 },
    });
    expect(row().columns[1]!.valign).toBe('middle');
    expect(row().columns[1]!.box).toEqual({ background_color: '#eef2ff', border_radius: 8 });
    endHistoryBurst();
    store().updateContainerColumn('cnt', 'cnt-c1', { box: undefined });
    expect('box' in row().columns[1]!).toBe(false);
    expect(store().hasUserEdited).toBe(true);
  });

  it('duplicating a 3-column container re-ids every column and every child', () => {
    store().duplicateBlock('cnt');
    const columnIds = collectColumnIds(top());
    const blockIds = collectBlockIds(top());
    expect(columnIds).toHaveLength(6);
    expect(new Set(columnIds).size).toBe(6);
    expect(new Set(blockIds).size).toBe(blockIds.length);
    expect(ids(row(1), 0)).toHaveLength(1);
    expect(ids(row(1), 0)[0]).not.toBe('A');
  });
});

describe('one level of container nesting', () => {
  const inner = () => container('inner', [[text('x')], [text('y')]]);

  beforeEach(() => {
    seed(container('outer', [[text('A'), inner()], [text('B')]]), text('T'));
  });

  it('a container may sit in a column of a top-level container', () => {
    const fresh = container('fresh', [[], []]);
    expect(store().addChildToColumn('outer', 'outer-c1', fresh)).toBe(true);
    expect(ids(row(), 1)).toEqual(['B', 'fresh']);
  });

  it('refuses a container inside a nested container’s column', () => {
    const fresh = container('fresh', [[], []]);
    expect(store().addChildToColumn('inner', 'inner-c0', fresh)).toBe(false);
    expect(store().insertBlockAfter('x', fresh)).toBe(false);
    expect(store().moveBlockToColumn('outer', 'inner', 'inner-c1')).toBe(false);
    expect(useHistoryStore.getState().past).toHaveLength(0);
    // Leaves are fine at that depth.
    expect(store().insertBlockAfter('x', text('leaf'))).toBe(true);
  });

  it('refuses to move a container holding a container into another column', () => {
    seed(container('outer', [[inner()], []]), container('other', [[], []]));
    expect(store().moveBlockToColumn('outer', 'other', 'other-c0')).toBe(false);
    expect(store().moveBlock('outer', 'other', 'after')).toBe(true); // top level is fine
  });

  it('paste rejects anything that would nest more than one level', () => {
    const nested = container('nested', [[container('deep', [[text('z')]])]]);
    // Pasting a 2-level container next to a block inside a column → 3 levels.
    expect(store().pasteBlock(nested, 'A')).toBeNull();
    // A plain container next to a block inside a NESTED container → 3 levels.
    expect(store().pasteBlock(container('plain', [[]]), 'x')).toBeNull();
    expect(useHistoryStore.getState().past).toHaveLength(0);

    // Allowed: a plain container inside a top-level column, anything at the top level.
    expect(store().pasteBlock(container('plain', [[]]), 'A')).not.toBeNull();
    expect(store().pasteBlock(nested, 'T')).not.toBeNull();
    expect(store().pasteBlock(nested, null)).not.toBeNull();
  });

  it('paste migrates a 1.0-shaped container from an older clipboard', () => {
    const legacy = {
      id: 'cnt_old',
      type: 'container',
      columns: 2,
      gap: 8,
      left_width: 30,
      children: [text('L')],
      right_children: [text('R')],
    } as unknown as Block;
    const id = store().pasteBlock(legacy, 'T');
    const pasted = top().find((b) => b.id === id) as ContainerBlock;
    expect(Array.isArray(pasted.columns)).toBe(true);
    expect(widths(pasted)).toEqual([30, 70]);
    expect((pasted.columns[1]!.children[0] as { content: string }).content).toBe('R');
    expect(pasted.columns[1]!.children[0]!.id).not.toBe('R');
    expect('right_children' in pasted).toBe(false);
  });
});
