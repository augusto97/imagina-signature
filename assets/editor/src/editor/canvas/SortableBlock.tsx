import type { FC } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block } from '@/core/schema/blocks';
import { useSelectionStore } from '@/stores/selectionStore';
import { BlockRenderer } from './BlockRenderer';
import { SelectionOverlay } from './SelectionOverlay';
import { BlockToolbar } from './BlockToolbar';

interface Props {
  block: Block;
}

/**
 * Sortable wrapper for a block on the canvas.
 *
 * dnd-kit's `useSortable` hook handles registration with the parent
 * SortableContext; we layer it on top of {@link SelectionOverlay}
 * (selection / hover outline) and {@link BlockToolbar} (duplicate /
 * delete / drag handle). Activation distance is tuned at the
 * DndContext level so a click-to-select doesn't trigger a drag.
 */
export const SortableBlock: FC<Props> = ({ block }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const { selectedBlockId, hoveredBlockId, select, hover } = useSelectionStore();
  const isSelected = block.id === selectedBlockId;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SelectionOverlay
        selected={isSelected}
        hovered={block.id === hoveredBlockId}
        onSelect={() => select(block.id)}
        onHoverEnter={() => hover(block.id)}
        onHoverLeave={() => hover(null)}
      >
        <BlockRenderer block={block} />
      </SelectionOverlay>
      {isSelected && <BlockToolbar block={block} dragHandleProps={{ ...attributes, ...listeners }} />}
    </div>
  );
};
