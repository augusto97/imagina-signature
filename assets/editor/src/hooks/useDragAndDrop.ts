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
import { useToastStore } from '@/stores/toastStore';
import {
  canPlaceAtDepth,
  findBlock,
  findColumn,
  isDescendantOf,
  locateBlock,
} from '@/core/schema/tree';
import { getBlockDefinition } from '@/core/blocks/registry';
import type { Block } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import {
  CANVAS_ROOT_DROP_ID,
  editorCollisionDetection,
  getLastDragPointer,
  isZoneId,
  parseCellDropId,
  resetDragPointer,
  resolveDropPosition,
  type CellDropTarget,
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
 * Container levels the dragged thing brings with it: a library card is
 * judged by a fresh instance of its type; a canvas block by itself.
 */
function draggedBlock(active: Active): Block | null {
  const libraryType = libraryTypeOf(active);
  if (libraryType) {
    const definition = getBlockDefinition(libraryType);
    return definition ? (definition.create() as Block) : null;
  }
  return findBlock(useSchemaStore.getState().schema.blocks, String(active.id)) ?? null;
}

/** Whether the dragged thing may land in the list holding `targetId`. */
function canDropNextTo(active: Active, targetId: string): boolean {
  const block = draggedBlock(active);
  if (!block) return false;
  const loc = locateBlock(useSchemaStore.getState().schema.blocks, targetId);
  return canPlaceAtDepth(block, loc ? loc.depth : 0);
}

/**
 * True only when a drop on `overId` is refused BECAUSE it would nest
 * containers deeper than allowed (other refusals — dropping a container
 * into itself, unknown targets — stay silent no-ops).
 */
function isTooDeepDrop(active: Active, overId: string, cell: CellDropTarget | null): boolean {
  const block = draggedBlock(active);
  if (!block) return false;
  const blocks = useSchemaStore.getState().schema.blocks;
  const activeId = String(active.id);
  const fromCanvas = libraryTypeOf(active) === null;

  if (cell) {
    const column = findColumn(blocks, cell.containerId, cell.columnId);
    if (!column) return false;
    if (
      fromCanvas &&
      (activeId === cell.containerId || isDescendantOf(blocks, activeId, cell.containerId))
    ) {
      return false;
    }
    return !canPlaceAtDepth(block, column.depth);
  }

  if (overId === CANVAS_ROOT_DROP_ID || isZoneId(overId) || overId === activeId) return false;
  const loc = locateBlock(blocks, overId);
  if (!loc) return false;
  if (fromCanvas && isDescendantOf(blocks, activeId, overId)) return false;
  return !canPlaceAtDepth(block, loc.depth);
}

function warnTooDeep(): void {
  useToastStore
    .getState()
    .show(__('Containers can only be nested one level deep.'), 'error');
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
  // Would nest containers too deep: no indicator, no drop.
  if (!canDropNextTo(active, overId)) return null;
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
 *     rect's centre). Works at any depth: the store helpers walk every
 *     container column.
 *   - a container column zone (`container-cell:{containerId}:{columnId}`)
 *     → append to that column.
 *
 * Containers nest one level at most: a target that would put a
 * container deeper shows no indicator and the drop is refused with a
 * toast.
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
  const addChildToColumn = useSchemaStore((s) => s.addChildToColumn);
  const moveBlockToColumn = useSchemaStore((s) => s.moveBlockToColumn);
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
    const activeId = String(active.id);

    // Dropping a container where it would nest too deep: refuse with
    // an explanation instead of silently doing nothing.
    if (isTooDeepDrop(active, overId, cellTarget)) {
      warnTooDeep();
      return;
    }

    // ---- Library card → schema -------------------------------------
    if (libraryType) {
      const definition = getBlockDefinition(libraryType);
      if (!definition) return;
      // create() returns the concrete Block subtype but the registry
      // is type-erased; cast back to the discriminated union.
      const fresh = definition.create() as Block;

      let inserted = false;
      if (cellTarget) {
        inserted = addChildToColumn(cellTarget.containerId, cellTarget.columnId, fresh);
      } else if (overId === CANVAS_ROOT_DROP_ID) {
        inserted = addBlock(fresh);
      } else if (target) {
        inserted =
          target.position === 'before'
            ? insertBlockBefore(target.targetId, fresh)
            : insertBlockAfter(target.targetId, fresh);
      }
      if (inserted) select(fresh.id);
      return;
    }

    // ---- Canvas block → schema -------------------------------------
    if (activeId === overId) return;

    if (cellTarget) {
      // Column zone (empty column, or the gap below its last child):
      // append. The store refuses a container dropped into its own
      // column and anything that would nest too deep.
      moveBlockToColumn(activeId, cellTarget.containerId, cellTarget.columnId);
      return;
    }

    if (!target) return;
    // `moveBlock` walks every container column, so this works for
    // top-level AND nested / cross-column drags.
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
