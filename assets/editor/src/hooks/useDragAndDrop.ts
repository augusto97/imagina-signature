import { useState } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Active,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useDropIndicatorStore } from '@/stores/dropIndicatorStore';
import { isDescendantOf } from '@/stores/schemaUtils';
import { getBlockDefinition } from '@/core/blocks/registry';
import type { Block } from '@/core/schema/blocks';
import {
  CANVAS_ROOT_DROP_ID,
  editorCollisionDetection,
  getLastDragPointer,
  isZoneId,
  parseCellDropId,
  resetDragPointer,
  resolveDropPosition,
  type DropPosition,
} from '@/editor/canvas/dnd';

interface LibraryDragData {
  source?: string;
  blockType?: string;
}

function libraryTypeOf(active: Active): string | null {
  const data = active.data.current as LibraryDragData | undefined;
  return data?.source === 'library' && typeof data.blockType === 'string' ? data.blockType : null;
}

/**
 * Vertical position used to decide before/after: the pointer for
 * mouse / touch drags, the centre of the dragged rect for keyboard
 * drags (which have no pointer).
 */
function dragY(active: Active): number | null {
  const pointer = getLastDragPointer();
  if (pointer) return pointer.y;
  const rect = active.rect.current.translated;
  return rect ? rect.top + rect.height / 2 : null;
}

/**
 * Where a drop over `over` would land, or null when it would be a
 * no-op / invalid (over itself, over a zone, inside its own subtree).
 */
function blockDropTarget(
  active: Active,
  over: Over | null,
): { targetId: string; position: DropPosition } | null {
  if (!over) return null;
  const overId = String(over.id);
  const activeId = String(active.id);
  if (overId === activeId || isZoneId(overId)) return null;
  if (
    libraryTypeOf(active) === null &&
    isDescendantOf(useSchemaStore.getState().schema.blocks, activeId, overId)
  ) {
    return null;
  }
  return { targetId: overId, position: resolveDropPosition(over.rect, dragY(active)) };
}

/**
 * Owns the drag lifecycle shared by the library and the canvas
 * (CLAUDE.md §11).
 *
 * Library cards carry `{ source: 'library', blockType }` in their
 * data; canvas blocks are sortables carrying `{ kind: 'block', zone }`.
 * Drop targets (see `editor/canvas/dnd.ts`):
 *
 *   - a block → insert / move BEFORE or AFTER it, depending on which
 *     half of the block the pointer is in (keyboard drags: the dragged
 *     rect's centre). Works at any depth: the store helpers walk both
 *     container cells.
 *   - an empty container cell (`container-cell:{id}:{side}`) → append
 *     to that cell.
 *   - the canvas root (`canvas-root`, only reported for an empty
 *     canvas — otherwise the collision detection resolves to the
 *     nearest top-level block) → append.
 *
 * While dragging, the would-be target + position are mirrored into
 * {@link useDropIndicatorStore} so the target block draws a 2px line
 * above / below itself.
 */
export function useDragAndDrop() {
  const moveBlock = useSchemaStore((s) => s.moveBlock);
  const insertBlockAfter = useSchemaStore((s) => s.insertBlockAfter);
  const insertBlockBefore = useSchemaStore((s) => s.insertBlockBefore);
  const addBlock = useSchemaStore((s) => s.addBlock);
  const addChildToContainer = useSchemaStore((s) => s.addChildToContainer);
  const moveBlockToContainerCell = useSchemaStore((s) => s.moveBlockToContainerCell);
  const select = useSelectionStore((s) => s.select);
  const showIndicator = useDropIndicatorStore((s) => s.show);
  const clearIndicator = useDropIndicatorStore((s) => s.clear);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingLibraryType, setDraggingLibraryType] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reset = (): void => {
    setDraggingId(null);
    setDraggingLibraryType(null);
    clearIndicator();
    resetDragPointer();
  };

  const handleDragStart = (event: DragStartEvent) => {
    resetDragPointer();
    clearIndicator();
    const libraryType = libraryTypeOf(event.active);
    if (libraryType) {
      setDraggingLibraryType(libraryType);
      return;
    }
    setDraggingId(String(event.active.id));
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const target = blockDropTarget(event.active, event.over);
    if (target) {
      showIndicator(target.targetId, target.position);
    } else {
      clearIndicator();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const target = blockDropTarget(active, over);
    reset();

    if (!over) return;

    const overId = String(over.id);
    const cellTarget = parseCellDropId(overId);
    const libraryType = libraryTypeOf(active);

    // ---- Library card → schema -------------------------------------
    if (libraryType) {
      const definition = getBlockDefinition(libraryType);
      if (!definition) return;
      // create() returns the concrete Block subtype but the registry
      // is type-erased; cast back to the discriminated union.
      const fresh = definition.create() as Block;

      if (cellTarget) {
        addChildToContainer(cellTarget.containerId, fresh, cellTarget.cell);
      } else if (overId === CANVAS_ROOT_DROP_ID) {
        addBlock(fresh);
      } else if (target) {
        if (target.position === 'before') {
          insertBlockBefore(target.targetId, fresh);
        } else {
          insertBlockAfter(target.targetId, fresh);
        }
      } else {
        return;
      }
      select(fresh.id);
      return;
    }

    // ---- Canvas block → schema -------------------------------------
    const activeId = String(active.id);
    if (activeId === overId) return;

    if (cellTarget) {
      // Empty cell (or a container dropped onto its own cell, which
      // the store rejects): append to that cell.
      if (cellTarget.containerId === activeId) return;
      if (isDescendantOf(useSchemaStore.getState().schema.blocks, activeId, cellTarget.containerId)) {
        return;
      }
      moveBlockToContainerCell(activeId, cellTarget.containerId, cellTarget.cell);
      return;
    }

    if (!target) return;
    // `moveBlock` walks both cells of every container, so this works
    // for top-level AND nested / cross-cell drags.
    moveBlock(activeId, target.targetId, target.position);
  };

  const handleDragCancel = () => {
    reset();
  };

  return {
    sensors,
    collisionDetection: editorCollisionDetection,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
    draggingId,
    draggingLibraryType,
  };
}
