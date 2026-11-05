import { memo, type FC } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block } from '@/core/schema/blocks';
import { useSelectionStore } from '@/stores/selectionStore';
import { useDropIndicatorStore } from '@/stores/dropIndicatorStore';
import { BlockRenderer } from './BlockRenderer';
import { SelectionOverlay } from './SelectionOverlay';
import { BlockToolbar } from './BlockToolbar';
import { DropIndicator } from './DropIndicators';
import { CANVAS_ROOT_DROP_ID, type BlockDragData } from './dnd';

interface Props {
  block: Block;
  /**
   * Droppable id of the zone this block lives in: the canvas root for
   * top-level blocks, `container-cell:{id}:{side}` for nested ones.
   * Lets the collision detection resolve "pointer in the zone's empty
   * space" to the nearest block of that zone.
   */
  zone?: string;
}

/**
 * Sortable wrapper for a block on the canvas — used for top-level
 * blocks AND for blocks nested inside container cells, so both get
 * the same selection outline, hover outline, floating
 * {@link BlockToolbar} and drop indicator.
 *
 * dnd-kit's `useSortable` hook handles registration with the parent
 * SortableContext. Activation distance is tuned at the DndContext
 * level so a click-to-select doesn't trigger a drag. Selection /
 * hover / indicator subscriptions are per-block booleans so a hover
 * change re-renders two blocks, not the whole canvas; `memo` skips
 * blocks whose (immer-shared) data didn't change.
 */
const SortableBlockImpl: FC<Props> = ({ block, zone = CANVAS_ROOT_DROP_ID }) => {
  const data: BlockDragData = { kind: 'block', zone };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data,
  });

  const isSelected = useSelectionStore((s) => s.selectedBlockId === block.id);
  const isHovered = useSelectionStore((s) => s.hoveredBlockId === block.id);
  const select = useSelectionStore((s) => s.select);
  const hover = useSelectionStore((s) => s.hover);
  const indicator = useDropIndicatorStore((s) => (s.targetId === block.id ? s.position : null));

  // Hidden blocks (Layers panel eye toggle flips `block.visible` to
  // false) get a faded canvas treatment and are skipped entirely by
  // the export compiler — see compileSignature in core/compiler/compile.
  const isHidden = block.visible === false;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : isHidden ? 0.35 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} data-imgsig-block-id={block.id}>
      <SelectionOverlay
        selected={isSelected}
        hovered={isHovered}
        onSelect={() => select(block.id)}
        onHoverEnter={() => {
          if (useSelectionStore.getState().hoveredBlockId !== block.id) hover(block.id);
        }}
        onHoverLeave={() => {
          if (useSelectionStore.getState().hoveredBlockId === block.id) hover(null);
        }}
      >
        <BlockRenderer block={block} />
      </SelectionOverlay>
      {indicator && <DropIndicator position={indicator} />}
      {isSelected && <BlockToolbar block={block} dragHandleProps={{ ...attributes, ...listeners }} />}
    </div>
  );
};

export const SortableBlock = memo(SortableBlockImpl);
SortableBlock.displayName = 'SortableBlock';
