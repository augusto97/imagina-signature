import {
  closestCenter,
  pointerWithin,
  type Collision,
  type CollisionDetection,
  type DroppableContainer,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import type { SortingStrategy } from '@dnd-kit/sortable';
import type { ContainerCell } from '@/stores/schemaStore';

/**
 * Canvas drag-and-drop primitives shared by the Canvas, SortableBlock,
 * the Container cells and {@link useDragAndDrop}.
 *
 * Model: every canvas block is a sortable droppable that lives in a
 * "zone" — either the canvas root or one container cell. Zones are
 * droppables too, so empty areas (the empty canvas, an empty cell)
 * accept drops. A drop on a block lands before or after it depending
 * on which half of the block the pointer is in; a drop on a zone
 * resolves to the nearest block in that zone, or appends when the
 * zone is empty.
 */

/** Droppable id of the canvas root (the zone holding top-level blocks). */
export const CANVAS_ROOT_DROP_ID = 'canvas-root';

/** Prefix of container-cell zone ids — see `cellDropId()` in the container block. */
const CELL_DROP_PREFIX = 'container-cell:';

/** Data every canvas SortableBlock registers with dnd-kit. */
export interface BlockDragData {
  kind: 'block';
  /** Droppable id of the zone (canvas root or cell) the block lives in. */
  zone: string;
}

export type DropPosition = 'before' | 'after';

/**
 * Decode a `container-cell:{containerId}:{left|right}` drop-target id
 * back into the container id + cell side. Returns null for any other id.
 */
export function parseCellDropId(id: string): { containerId: string; cell: ContainerCell } | null {
  if (!id.startsWith(CELL_DROP_PREFIX)) return null;
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  const cell = parts[2];
  if (cell !== 'left' && cell !== 'right') return null;
  return { containerId: parts[1] ?? '', cell };
}

/** Whether a droppable id is a zone (canvas root / container cell) rather than a block. */
export function isZoneId(id: UniqueIdentifier): boolean {
  const s = String(id);
  return s === CANVAS_ROOT_DROP_ID || s.startsWith(CELL_DROP_PREFIX);
}

/**
 * Sorting strategy that never shifts siblings. The canvas shows a
 * drop-indicator line instead of animating blocks out of the way —
 * shifting would put the blocks somewhere other than where the line
 * says the drop will land.
 */
export const noShiftSortingStrategy: SortingStrategy = () => null;

/**
 * `before` when `y` is in the top half of `rect`, `after` otherwise
 * (and when either is unknown).
 */
export function resolveDropPosition(
  rect: { top: number; height: number } | null | undefined,
  y: number | null | undefined,
): DropPosition {
  if (!rect || y === null || y === undefined) return 'after';
  return y < rect.top + rect.height / 2 ? 'before' : 'after';
}

let lastPointer: { x: number; y: number } | null = null;

/**
 * Pointer coordinates seen by the latest collision pass, in the same
 * coordinate space as `over.rect`. Null for keyboard drags.
 */
export function getLastDragPointer(): { x: number; y: number } | null {
  return lastPointer;
}

/** Forget the stored pointer (drag ended / cancelled). */
export function resetDragPointer(): void {
  lastPointer = null;
}

function verticalDistance(y: number, rect: { top: number; bottom: number }): number {
  if (y < rect.top) return rect.top - y;
  if (y > rect.bottom) return y - rect.bottom;
  return 0;
}

/**
 * Collision detection for the editor canvas.
 *
 * Pointer drags:
 *   1. Candidates are the droppables under the pointer, minus anything
 *      nested inside the dragged block (a container can't be dropped
 *      into its own cell).
 *   2. The most specific one wins (smallest area): a nested child beats
 *      its cell, a cell beats its container, everything beats the root.
 *   3. If that is a zone with blocks in it (pointer in the canvas
 *      padding or between children of a cell), resolve to the zone's
 *      block nearest to the pointer, so before/after still applies.
 *   4. Pointer outside every droppable (e.g. back over the sidebar)
 *      means "no drop".
 *
 * Keyboard drags have no pointer; they fall back to closest-center
 * among blocks and cells.
 */
export const editorCollisionDetection: CollisionDetection = (args) => {
  const { active, droppableContainers, droppableRects, pointerCoordinates } = args;
  lastPointer = pointerCoordinates;

  const activeNode = droppableContainers.find((c) => c.id === active.id)?.node.current ?? null;
  const candidates: DroppableContainer[] = activeNode
    ? droppableContainers.filter((c) => {
        if (c.id === active.id) return true;
        const node = c.node.current;
        return !node || !activeNode.contains(node);
      })
    : droppableContainers;

  if (!pointerCoordinates) {
    const pool = candidates.filter((c) => c.id !== CANVAS_ROOT_DROP_ID);
    return closestCenter({ ...args, droppableContainers: pool.length > 0 ? pool : candidates });
  }

  const hits = pointerWithin({ ...args, droppableContainers: candidates });
  if (hits.length === 0) return [];

  let best: Collision | undefined;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const hit of hits) {
    const rect = droppableRects.get(hit.id);
    if (!rect) continue;
    const area = rect.width * rect.height;
    if (area < bestArea) {
      best = hit;
      bestArea = area;
    }
  }
  if (!best) return hits;
  if (!isZoneId(best.id)) return [best];

  const zoneId = String(best.id);
  let nearest: DroppableContainer | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const container of candidates) {
    const data = container.data.current as Partial<BlockDragData> | undefined;
    if (data?.kind !== 'block' || data.zone !== zoneId) continue;
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const distance = verticalDistance(pointerCoordinates.y, rect);
    if (distance < nearestDistance) {
      nearest = container;
      nearestDistance = distance;
    }
  }
  if (!nearest) return [best];
  return [{ id: nearest.id, data: { droppableContainer: nearest, value: nearestDistance } }];
};
