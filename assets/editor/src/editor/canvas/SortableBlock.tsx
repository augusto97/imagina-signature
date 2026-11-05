import { memo, type FC } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Lock } from 'lucide-react';
import type { Block } from '@/core/schema/blocks';
import { canRestructureBlock, lockedBlockIds } from '@/core/schema/locks';
import { useSelectionStore } from '@/stores/selectionStore';
import { useDropIndicatorStore } from '@/stores/dropIndicatorStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useEditPolicy } from '@/stores/linkStore';
import { __ } from '@/i18n/helpers';
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
 *
 * Locks (1.3.0): a block with `locked: true` shows a lock badge (to
 * everyone, so administrators see what they locked). When the lock
 * policy applies to the user, locked blocks — and every block of a
 * `locked_design` / `fields_only` template — can't be dragged.
 */
const SortableBlockImpl: FC<Props> = ({ block, zone = CANVAS_ROOT_DROP_ID }) => {
  const data: BlockDragData = { kind: 'block', zone };
  const policy = useEditPolicy();
  const isLocked = useSchemaStore((s) => lockedBlockIds(s.schema.blocks).has(block.id));
  const canMove = canRestructureBlock(policy, isLocked);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data,
    disabled: !canMove,
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
      {block.locked === true && (
        <span
          className="pointer-events-none absolute -left-2 -top-2 z-10 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white shadow"
          title={__('Locked by your administrator')}
          aria-label={__('Locked block')}
          data-imgsig-lock-badge=""
        >
          <Lock size={9} strokeWidth={2.5} />
        </span>
      )}
      {indicator && <DropIndicator position={indicator} />}
      {isSelected && (
        <BlockToolbar
          block={block}
          locked={isLocked}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      )}
    </div>
  );
};

export const SortableBlock = memo(SortableBlockImpl);
SortableBlock.displayName = 'SortableBlock';
