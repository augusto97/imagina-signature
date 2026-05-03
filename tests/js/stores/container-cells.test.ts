import { describe, it, expect, beforeEach } from 'vitest';
import { useSchemaStore } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { createEmptySchema } from '@/core/schema/signature';
import { migrateContainersInPlace } from '@/core/schema/migrate';
import type { ContainerBlock, TextBlock } from '@/core/schema/blocks';

/**
 * Container cell behaviour pinned by 1.0.31:
 *   - left vs right children are independent arrays.
 *   - addChildToContainer routes to the requested cell.
 *   - moveBlockToContainerCell relocates a block across cells.
 *   - setContainerColumns 2→1 merges right_children back into
 *     children so no block is silently lost; 1→2 leaves children
 *     in the LEFT cell + creates an empty right_children.
 *   - migrateContainersInPlace splits legacy 2-col rows that only
 *     had `children` into explicit left / right arrays the way
 *     the old compiler used to render them.
 */

const txt = (id: string): TextBlock => ({
  id,
  type: 'text',
  content: id,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

const container = (id: string, columns: 1 | 2, left: TextBlock[], right?: TextBlock[]): ContainerBlock => ({
  id,
  type: 'container',
  columns,
  gap: 16,
  children: left,
  right_children: right ?? [],
});

describe('Container cells (1.0.31)', () => {
  beforeEach(() => {
    useSchemaStore.setState({ schema: createEmptySchema(), hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
  });

  it('addChildToContainer routes to the requested cell', () => {
    useSchemaStore.setState((s) => {
      const schema = createEmptySchema();
      schema.blocks.push(container('cnt', 2, [txt('L1')], [txt('R1')]));
      return { schema, hasUserEdited: s.hasUserEdited };
    });

    useSchemaStore.getState().addChildToContainer('cnt', txt('L2'), 'left');
    useSchemaStore.getState().addChildToContainer('cnt', txt('R2'), 'right');

    const cnt = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['L1', 'L2']);
    expect(cnt.right_children?.map((c) => c.id)).toEqual(['R1', 'R2']);
  });

  it('moveBlockToContainerCell moves a block across cells', () => {
    useSchemaStore.setState((s) => {
      const schema = createEmptySchema();
      schema.blocks.push(container('cnt', 2, [txt('A'), txt('B')], [txt('C')]));
      return { schema, hasUserEdited: s.hasUserEdited };
    });

    // Move A from left cell to right cell.
    useSchemaStore.getState().moveBlockToContainerCell('A', 'cnt', 'right');

    const cnt = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['B']);
    expect(cnt.right_children?.map((c) => c.id)).toEqual(['C', 'A']);
  });

  it('setContainerColumns 2→1 merges right_children back into children', () => {
    useSchemaStore.setState((s) => {
      const schema = createEmptySchema();
      schema.blocks.push(container('cnt', 2, [txt('A')], [txt('B'), txt('C')]));
      return { schema, hasUserEdited: s.hasUserEdited };
    });

    useSchemaStore.getState().setContainerColumns('cnt', 1);

    const cnt = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect(cnt.columns).toBe(1);
    expect(cnt.children.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(cnt.right_children).toEqual([]);
  });

  it('setContainerColumns 1→2 keeps everything in the left cell', () => {
    useSchemaStore.setState((s) => {
      const schema = createEmptySchema();
      schema.blocks.push(container('cnt', 1, [txt('A'), txt('B'), txt('C')]));
      return { schema, hasUserEdited: s.hasUserEdited };
    });

    useSchemaStore.getState().setContainerColumns('cnt', 2);

    const cnt = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect(cnt.columns).toBe(2);
    expect(cnt.children.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(cnt.right_children).toEqual([]);
  });

  it('moveBlock works between cells via findParentAndIndex', () => {
    useSchemaStore.setState((s) => {
      const schema = createEmptySchema();
      schema.blocks.push(container('cnt', 2, [txt('A'), txt('B')], [txt('C'), txt('D')]));
      return { schema, hasUserEdited: s.hasUserEdited };
    });

    // Drag B (left) to land after C (right).
    useSchemaStore.getState().moveBlock('B', 'C', 'after');

    const cnt = useSchemaStore.getState().schema.blocks[0] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['A']);
    expect(cnt.right_children?.map((c) => c.id)).toEqual(['C', 'B', 'D']);
  });
});

describe('migrateContainersInPlace (legacy 2-col split)', () => {
  it('splits legacy 2-col container.children into left + right halves', () => {
    const schema = createEmptySchema();
    // Pre-1.0.31 row: 4 children, no right_children field. The old
    // compiler split via Math.ceil(4/2) = 2, so children[0..1] →
    // left, children[2..3] → right.
    schema.blocks.push({
      id: 'legacy',
      type: 'container',
      columns: 2,
      gap: 16,
      children: [txt('A'), txt('B'), txt('C'), txt('D')],
      // Note: no right_children field — that's the legacy shape.
    } as ContainerBlock);

    migrateContainersInPlace(schema);

    const cnt = schema.blocks[0] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['A', 'B']);
    expect(cnt.right_children?.map((c) => c.id)).toEqual(['C', 'D']);
  });

  it('is idempotent: a freshly-migrated container is left alone', () => {
    const schema = createEmptySchema();
    schema.blocks.push(container('cnt', 2, [txt('L')], [txt('R')]));
    migrateContainersInPlace(schema);
    migrateContainersInPlace(schema);

    const cnt = schema.blocks[0] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['L']);
    expect(cnt.right_children?.map((c) => c.id)).toEqual(['R']);
  });

  it('1-col container with stray right_children gets merged back into children', () => {
    const schema = createEmptySchema();
    schema.blocks.push({
      id: 'cnt',
      type: 'container',
      columns: 1,
      gap: 16,
      children: [txt('A')],
      right_children: [txt('B'), txt('C')],
    });

    migrateContainersInPlace(schema);

    const cnt = schema.blocks[0] as ContainerBlock;
    expect(cnt.children.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(cnt.right_children).toEqual([]);
  });
});
