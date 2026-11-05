import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type {
  Active,
  ClientRect,
  DragEndEvent,
  DragMoveEvent,
  DroppableContainer,
  Over,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  CANVAS_ROOT_DROP_ID,
  editorCollisionDetection,
  resetDragPointer,
  resolveDropPosition,
} from '@/editor/canvas/dnd';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useDropIndicatorStore } from '@/stores/dropIndicatorStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { ContainerBlock, TextBlock } from '@/core/schema/blocks';
import '@/core/blocks';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function rect(top: number, height: number, left = 0, width = 600): ClientRect {
  return { top, height, left, width, bottom: top + height, right: left + width };
}

interface FakeDroppable {
  id: string;
  rect: ClientRect;
  data?: Record<string, unknown>;
  node?: HTMLElement;
}

function containers(list: FakeDroppable[]): DroppableContainer[] {
  return list.map((d) => ({
    id: d.id,
    key: d.id,
    disabled: false,
    data: { current: d.data ?? {} },
    node: { current: d.node ?? document.createElement('div') },
    rect: { current: d.rect },
  })) as unknown as DroppableContainer[];
}

function activeOf(id: string, data: Record<string, unknown> = {}, translated: ClientRect | null = null): Active {
  return {
    id,
    data: { current: data },
    rect: { current: { initial: translated, translated } },
  } as unknown as Active;
}

function overOf(id: string, r: ClientRect): Over {
  return { id, rect: r, disabled: false, data: { current: {} } } as unknown as Over;
}

function detect(
  active: Active,
  list: FakeDroppable[],
  pointer: { x: number; y: number } | null,
): UniqueIdentifier[] {
  const rects = new Map<UniqueIdentifier, ClientRect>(list.map((d) => [d.id, d.rect]));
  return editorCollisionDetection({
    active,
    collisionRect: rect(0, 10),
    droppableRects: rects,
    droppableContainers: containers(list),
    pointerCoordinates: pointer,
  }).map((c) => c.id);
}

const text = (id: string): TextBlock => ({
  id,
  type: 'text',
  content: id,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

// Layout used by the collision tests:
//   canvas-root      0..400
//   a (top-level)   24..64
//   cnt (container) 64..264  → left cell 64..264 (x 0..300)
//                             child c1 70..110, child c2 120..160
//   b (top-level)  264..304
const LAYOUT: FakeDroppable[] = [
  { id: CANVAS_ROOT_DROP_ID, rect: rect(0, 400) },
  { id: 'a', rect: rect(24, 40), data: { kind: 'block', zone: CANVAS_ROOT_DROP_ID } },
  { id: 'cnt', rect: rect(64, 200), data: { kind: 'block', zone: CANVAS_ROOT_DROP_ID } },
  { id: 'container-cell:cnt:left', rect: rect(64, 200, 0, 300) },
  { id: 'c1', rect: rect(70, 40, 0, 300), data: { kind: 'block', zone: 'container-cell:cnt:left' } },
  { id: 'c2', rect: rect(120, 40, 0, 300), data: { kind: 'block', zone: 'container-cell:cnt:left' } },
  { id: 'b', rect: rect(264, 40), data: { kind: 'block', zone: CANVAS_ROOT_DROP_ID } },
];

// ---------------------------------------------------------------------------

describe('resolveDropPosition', () => {
  it('uses the target midpoint', () => {
    expect(resolveDropPosition(rect(100, 40), 105)).toBe('before');
    expect(resolveDropPosition(rect(100, 40), 135)).toBe('after');
    expect(resolveDropPosition(rect(100, 40), null)).toBe('after');
  });
});

describe('editorCollisionDetection', () => {
  beforeEach(() => resetDragPointer());

  it('picks the most specific droppable under the pointer (nested child)', () => {
    expect(detect(activeOf('b'), LAYOUT, { x: 50, y: 80 })).toEqual(['c1']);
  });

  it('resolves the gap between cell children to the nearest child', () => {
    expect(detect(activeOf('b'), LAYOUT, { x: 50, y: 200 })).toEqual(['c2']);
  });

  it('resolves canvas padding to the nearest top-level block', () => {
    expect(detect(activeOf('b'), LAYOUT, { x: 590, y: 5 })).toEqual(['a']);
    expect(detect(activeOf('a'), LAYOUT, { x: 590, y: 380 })).toEqual(['b']);
  });

  it('reports the root itself for an empty canvas', () => {
    const empty = [LAYOUT[0]!];
    expect(detect(activeOf('library-text', { source: 'library', blockType: 'text' }), empty, { x: 10, y: 10 })).toEqual([
      CANVAS_ROOT_DROP_ID,
    ]);
  });

  it('returns no collision when the pointer is outside the canvas', () => {
    expect(detect(activeOf('a'), LAYOUT, { x: 900, y: 900 })).toEqual([]);
  });

  it("ignores droppables nested inside the dragged block", () => {
    const cntNode = document.createElement('div');
    const childNode = document.createElement('div');
    cntNode.appendChild(childNode);
    const layout = LAYOUT.map((d) =>
      d.id === 'cnt' ? { ...d, node: cntNode } : d.id === 'c1' ? { ...d, node: childNode } : d,
    );
    // Pointer over c1 while dragging its own container → c1 excluded,
    // falls back to the container itself (a no-op drop).
    expect(detect(activeOf('cnt'), layout, { x: 50, y: 80 })).not.toContain('c1');
  });
});

describe('useDragAndDrop drop handling', () => {
  beforeEach(() => {
    const schema = createEmptySchema();
    schema.blocks.push(text('a'), text('b'), text('c'));
    useSchemaStore.setState({ schema, hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
    useSelectionStore.setState({ selectedBlockId: null, hoveredBlockId: null });
    useDropIndicatorStore.setState({ targetId: null, position: null });
    endHistoryBurst();
    resetDragPointer();
  });

  const ids = (): string[] => useSchemaStore.getState().schema.blocks.map((b) => b.id);

  it('drops a library card onto an empty canvas', () => {
    useSchemaStore.setState({ schema: createEmptySchema() });
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragEnd({
        active: activeOf('library-text', { source: 'library', blockType: 'text' }),
        over: overOf(CANVAS_ROOT_DROP_ID, rect(0, 320)),
      } as unknown as DragEndEvent),
    );
    const blocks = useSchemaStore.getState().schema.blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('text');
    // The new block is selected so its properties open.
    expect(useSelectionStore.getState().selectedBlockId).toBe(blocks[0]?.id);
  });

  it('drops a library card BEFORE the first block when aimed at its top half', () => {
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragEnd({
        // keyboard-style drag: no pointer, uses the dragged rect centre
        active: activeOf('library-divider', { source: 'library', blockType: 'divider' }, rect(0, 10)),
        over: overOf('a', rect(0, 40)),
      } as unknown as DragEndEvent),
    );
    expect(ids()).toHaveLength(4);
    expect(ids()[0]).not.toBe('a');
    expect(ids().slice(1)).toEqual(['a', 'b', 'c']);
  });

  it('moves a canvas block to the very top', () => {
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragEnd({
        active: activeOf('c', { kind: 'block', zone: CANVAS_ROOT_DROP_ID }, rect(2, 10)),
        over: overOf('a', rect(0, 40)),
      } as unknown as DragEndEvent),
    );
    expect(ids()).toEqual(['c', 'a', 'b']);
  });

  it('moves a canvas block after the target when aimed at its bottom half', () => {
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragEnd({
        active: activeOf('a', { kind: 'block', zone: CANVAS_ROOT_DROP_ID }, rect(70, 10)),
        over: overOf('b', rect(40, 40)),
      } as unknown as DragEndEvent),
    );
    expect(ids()).toEqual(['b', 'a', 'c']);
  });

  it('mirrors the would-be drop into the indicator store and clears it on end', () => {
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragMove({
        active: activeOf('c', { kind: 'block', zone: CANVAS_ROOT_DROP_ID }, rect(2, 10)),
        over: overOf('a', rect(0, 40)),
      } as unknown as DragMoveEvent),
    );
    expect(useDropIndicatorStore.getState()).toMatchObject({ targetId: 'a', position: 'before' });

    act(() => result.current.handleDragCancel());
    expect(useDropIndicatorStore.getState().targetId).toBeNull();
  });

  it('refuses to drop a container into its own cell', () => {
    const schema = createEmptySchema();
    const cnt: ContainerBlock = {
      id: 'cnt',
      type: 'container',
      gap: 0,
      columns: [
        { id: 'left', width: 50, children: [text('x')] },
        { id: 'right', width: 50, children: [] },
      ],
    };
    schema.blocks.push(cnt);
    useSchemaStore.setState({ schema });
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragEnd({
        active: activeOf('cnt', { kind: 'block', zone: CANVAS_ROOT_DROP_ID }, rect(0, 10)),
        over: overOf('container-cell:cnt:right', rect(0, 100)),
      } as unknown as DragEndEvent),
    );
    expect(useSchemaStore.getState().schema.blocks.map((b) => b.id)).toEqual(['cnt']);
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });
});

describe('useDragAndDrop: column drops and the nesting limit', () => {
  type Column = ContainerBlock['columns'][number];
  const col = (id: string, children: Column['children']): Column => ({ id, width: 50, children });

  beforeEach(() => {
    const schema = createEmptySchema();
    const inner: ContainerBlock = {
      id: 'inner',
      type: 'container',
      gap: 0,
      columns: [col('ia', [text('x')]), col('ib', [])],
    };
    const outer: ContainerBlock = {
      id: 'outer',
      type: 'container',
      gap: 0,
      columns: [col('oa', [inner]), col('ob', [])],
    };
    schema.blocks.push(outer, text('t'));
    useSchemaStore.setState({ schema, hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
    useSelectionStore.setState({ selectedBlockId: null, hoveredBlockId: null });
    useDropIndicatorStore.setState({ targetId: null, position: null });
    endHistoryBurst();
    resetDragPointer();
  });

  const outerCols = () => (useSchemaStore.getState().schema.blocks[0] as ContainerBlock).columns;

  it('drops a library card into an empty column zone', () => {
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragEnd({
        active: activeOf('library-text', { source: 'library', blockType: 'text' }),
        over: overOf('container-cell:outer:ob', rect(0, 100)),
      } as unknown as DragEndEvent),
    );
    expect(outerCols()[1]!.children).toHaveLength(1);
    expect(useSelectionStore.getState().selectedBlockId).toBe(outerCols()[1]!.children[0]!.id);
  });

  it('allows a library container in a top-level column but not in a nested one', () => {
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragEnd({
        active: activeOf('library-container', { source: 'library', blockType: 'container' }),
        over: overOf('container-cell:outer:ob', rect(0, 100)),
      } as unknown as DragEndEvent),
    );
    expect(outerCols()[1]!.children.map((b) => b.type)).toEqual(['container']);

    const pastBefore = useHistoryStore.getState().past.length;
    act(() =>
      result.current.handleDragEnd({
        active: activeOf('library-container', { source: 'library', blockType: 'container' }),
        over: overOf('container-cell:inner:ib', rect(0, 100)),
      } as unknown as DragEndEvent),
    );
    const inner = outerCols()[0]!.children[0] as ContainerBlock;
    expect(inner.columns[1]!.children).toHaveLength(0);
    expect(useHistoryStore.getState().past).toHaveLength(pastBefore);
  });

  it('shows no drop indicator next to a nested-container child for a container drag', () => {
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragMove({
        active: activeOf(
          'library-container',
          { source: 'library', blockType: 'container' },
          rect(0, 10),
        ),
        over: overOf('x', rect(0, 40)),
      } as unknown as DragMoveEvent),
    );
    expect(useDropIndicatorStore.getState().targetId).toBeNull();

    // A leaf may go there.
    act(() =>
      result.current.handleDragMove({
        active: activeOf('library-text', { source: 'library', blockType: 'text' }, rect(0, 10)),
        over: overOf('x', rect(0, 40)),
      } as unknown as DragMoveEvent),
    );
    expect(useDropIndicatorStore.getState().targetId).toBe('x');
  });

  it('refuses to move a 2-level container into another container’s column', () => {
    const schema = useSchemaStore.getState().schema;
    const other: ContainerBlock = {
      id: 'other',
      type: 'container',
      gap: 0,
      columns: [{ ...col('pa', []), width: 100 }],
    };
    useSchemaStore.setState({ schema: { ...schema, blocks: [...schema.blocks, other] } });
    const { result } = renderHook(() => useDragAndDrop());
    act(() =>
      result.current.handleDragEnd({
        active: activeOf('outer', { kind: 'block', zone: CANVAS_ROOT_DROP_ID }, rect(0, 10)),
        over: overOf('container-cell:other:pa', rect(0, 100)),
      } as unknown as DragEndEvent),
    );
    expect(useSchemaStore.getState().schema.blocks.map((b) => b.id)).toEqual([
      'outer',
      't',
      'other',
    ]);
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });
});
