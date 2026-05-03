import { useState } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useSchemaStore, type ContainerCell } from '@/stores/schemaStore';
import { getBlockDefinition } from '@/core/blocks/registry';
import type { Block } from '@/core/schema/blocks';

/**
 * Decode a `container-cell:{containerId}:{left|right}` drop-target
 * id back into the container id + cell side. Returns null when the
 * id doesn't match the format (i.e. the drop landed on a regular
 * block / the canvas root).
 */
function parseCellDropId(id: string): { containerId: string; cell: ContainerCell } | null {
  if (!id.startsWith('container-cell:')) return null;
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  const cell = parts[2];
  if (cell !== 'left' && cell !== 'right') return null;
  return { containerId: parts[1] ?? '', cell };
}

/**
 * Owns the drag lifecycle shared by the library and the canvas.
 *
 * Library cards carry `{ source: 'library', blockType }` in their
 * data; canvas blocks just use their schema id. `handleDragEnd`
 * branches accordingly so a single DndContext can serve both flows
 * (CLAUDE.md §11.1).
 *
 * 1.0.31 added cell-aware drop targets — Container renders each
 * cell as a `useDroppable` zone with id
 * `container-cell:{containerId}:{left|right}`. Drops on these ids
 * route to `addChildToContainer(parent_id, fresh, cell)` for
 * library cards or `moveBlockToContainerCell(...)` for existing
 * canvas blocks. Drops on a regular block id keep the original
 * insertBlockAfter / moveBlock behaviour, with `findParentAndIndex`
 * walking into both cells of any container.
 */
export function useDragAndDrop() {
  const moveBlock = useSchemaStore((s) => s.moveBlock);
  const insertBlockAfter = useSchemaStore((s) => s.insertBlockAfter);
  const addBlock = useSchemaStore((s) => s.addBlock);
  const addChildToContainer = useSchemaStore((s) => s.addChildToContainer);
  const moveBlockToContainerCell = useSchemaStore((s) => s.moveBlockToContainerCell);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingLibraryType, setDraggingLibraryType] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { source?: string; blockType?: string } | undefined;
    if (data?.source === 'library' && typeof data.blockType === 'string') {
      setDraggingLibraryType(data.blockType);
      return;
    }
    setDraggingId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingId(null);
    setDraggingLibraryType(null);

    if (!over) return;

    const data = active.data.current as { source?: string; blockType?: string } | undefined;
    const overId = String(over.id);
    const cellTarget = parseCellDropId(overId);

    // ---- Library card → schema -------------------------------------
    if (data?.source === 'library' && typeof data.blockType === 'string') {
      const definition = getBlockDefinition(data.blockType);
      if (!definition) return;
      // create() returns the concrete Block subtype but the registry
      // is type-erased; cast back to the discriminated union.
      const fresh = definition.create() as Block;

      if (cellTarget) {
        // Drop landed on a Container's cell drop zone (empty cell or
        // the cell's padding around its children). Route to that
        // exact cell so the user gets the column they aimed at.
        addChildToContainer(cellTarget.containerId, fresh, cellTarget.cell);
        return;
      }

      if (overId === 'canvas-empty') {
        addBlock(fresh);
      } else {
        // Drop landed on an existing block — insert AFTER it. Works
        // for top-level AND nested children because
        // `insertBlockAfter` uses `findParentAndIndex` which walks
        // into both Container cells.
        insertBlockAfter(overId, fresh);
      }
      return;
    }

    // ---- Canvas block → schema -------------------------------------
    if (active.id === over.id) return;

    if (cellTarget) {
      // Block dragged onto an empty cell (or the empty drop zone of
      // a non-empty cell — useDroppable always covers the cell). Move
      // it to the END of that cell so the user can refine ordering
      // afterwards by dragging onto a specific sibling.
      moveBlockToContainerCell(String(active.id), cellTarget.containerId, cellTarget.cell);
      return;
    }

    // Reorder relative to a sibling block — `moveBlock` walks both
    // cells of every container, so this works for top-level AND
    // nested cross-cell drags (drop a left-cell block onto a right-
    // cell block to move it across).
    moveBlock(String(active.id), overId, 'after');
  };

  return {
    sensors,
    collisionDetection: closestCenter,
    handleDragStart,
    handleDragEnd,
    draggingId,
    draggingLibraryType,
  };
}
