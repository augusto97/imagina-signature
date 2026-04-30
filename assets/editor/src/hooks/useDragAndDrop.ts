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
import { useSchemaStore } from '@/stores/schemaStore';
import { getBlockDefinition } from '@/core/blocks/registry';
import type { Block } from '@/core/schema/blocks';

/**
 * Owns the drag lifecycle shared by the library and the canvas.
 *
 * Library cards carry `{ source: 'library', blockType }` in their
 * data; canvas blocks just use their schema id. `handleDragEnd`
 * branches accordingly so a single DndContext can serve both flows
 * (CLAUDE.md §11.1).
 */
export function useDragAndDrop() {
  const moveBlock = useSchemaStore((s) => s.moveBlock);
  const insertBlockAfter = useSchemaStore((s) => s.insertBlockAfter);
  const addBlock = useSchemaStore((s) => s.addBlock);

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

    if (data?.source === 'library' && typeof data.blockType === 'string') {
      const definition = getBlockDefinition(data.blockType);
      if (!definition) return;
      // create() returns the concrete Block subtype but the registry
      // is type-erased; cast back to the discriminated union.
      const fresh = definition.create() as Block;

      if (over.id === 'canvas-empty') {
        addBlock(fresh);
      } else {
        insertBlockAfter(String(over.id), fresh);
      }
      return;
    }

    if (active.id !== over.id) {
      moveBlock(String(active.id), String(over.id), 'after');
    }
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
