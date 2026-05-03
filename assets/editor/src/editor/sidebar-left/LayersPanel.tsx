import { useState, type FC } from 'react';
import { ChevronUp, ChevronDown, Eye, EyeOff, GripVertical, Layers, Trash2 } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSchemaStore, type ContainerCell } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { rendererForBlock } from '@/core/blocks/registry';
import type { Block, ContainerBlock } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

/**
 * Layers panel — hierarchical view of every block on the canvas.
 *
 * 1.0.31 added drag-and-drop: every layer row is a dnd-kit
 * sortable, and Container rows expose two "drop zone" rows (one
 * per cell, only one in 1-col mode) so the user can drag a top-
 * level block INTO a specific cell. The panel hosts its own
 * `<DndContext>` independent of the canvas DnD; that keeps the two
 * UIs from racing on collision detection (each context has its own
 * pointer sensor and ID space).
 *
 * Drop semantics inside the panel:
 *   - Drop on a regular block row    → move AFTER that row's block
 *     (uses `moveBlock` which walks both Container cells via
 *     `findParentAndIndex`).
 *   - Drop on a "Left cell" / "Right cell" zone of a Container →
 *     append to that cell.
 *
 * The chevron + eye + trash buttons stay around — drag is not
 * always faster than a one-click "move up" when the next row is
 * adjacent, and chevrons are accessible to keyboard users by
 * default.
 */
const CELL_DROP_PREFIX = 'layers-cell:';
function layersCellDropId(containerId: string, cell: ContainerCell): string {
  return `${CELL_DROP_PREFIX}${containerId}:${cell}`;
}

function parseLayersCellDropId(id: string): {
  containerId: string;
  cell: ContainerCell;
} | null {
  if (!id.startsWith(CELL_DROP_PREFIX)) return null;
  const parts = id.substring(CELL_DROP_PREFIX.length).split(':');
  if (parts.length !== 2) return null;
  const cell = parts[1];
  if (cell !== 'left' && cell !== 'right') return null;
  return { containerId: parts[0] ?? '', cell };
}

/**
 * Walks the schema tree and emits every block id in pre-order
 * (top-level, then each Container's left children, then its
 * right children). Used to build a single flat `SortableContext`
 * `items` array — dnd-kit needs to know about every sortable id
 * that participates in the same context.
 */
function flattenBlockIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    ids.push(block.id);
    if (block.type === 'container') {
      ids.push(...flattenBlockIds(block.children));
      if (Array.isArray(block.right_children)) {
        ids.push(...flattenBlockIds(block.right_children));
      }
    }
  }
  return ids;
}

export const LayersPanel: FC = () => {
  const blocks = useSchemaStore((s) => s.schema.blocks);
  const moveBlock = useSchemaStore((s) => s.moveBlock);
  const moveBlockToContainerCell = useSchemaStore((s) => s.moveBlockToContainerCell);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (event: DragStartEvent): void => {
    setDraggingId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    setDraggingId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Drop on a cell zone → move to that cell.
    const cellTarget = parseLayersCellDropId(overId);
    if (cellTarget) {
      moveBlockToContainerCell(activeId, cellTarget.containerId, cellTarget.cell);
      return;
    }

    // Drop on another block row → reorder after it. `moveBlock`
    // walks both cells of every container, so this works for top-
    // level AND cross-cell drags.
    moveBlock(activeId, overId, 'after');
  };

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[var(--border-strong)] text-[var(--text-muted)]">
          <Layers size={16} strokeWidth={1.6} />
        </span>
        <p className="text-[12px] font-medium text-[var(--text-secondary)]">
          {__('No layers yet')}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {__('Add blocks from the Blocks tab and they appear here.')}
        </p>
      </div>
    );
  }

  const allIds = flattenBlockIds(blocks);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-0.5 p-2">
          {blocks.map((block, index) => (
            <LayerRow
              key={block.id}
              block={block}
              depth={0}
              index={index}
              siblingsCount={blocks.length}
              draggingId={draggingId}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
};

interface LayerRowProps {
  block: Block;
  depth: number;
  index: number;
  siblingsCount: number;
  draggingId: string | null;
}

const LayerRow: FC<LayerRowProps> = ({ block, depth, index, siblingsCount, draggingId }) => {
  const updateBlock = useSchemaStore((s) => s.updateBlock);
  const deleteBlock = useSchemaStore((s) => s.deleteBlock);
  const moveBlockUp = useSchemaStore((s) => s.moveBlockUp);
  const moveBlockDown = useSchemaStore((s) => s.moveBlockDown);
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId);
  const hoveredBlockId = useSelectionStore((s) => s.hoveredBlockId);
  const select = useSelectionStore((s) => s.select);
  const hover = useSelectionStore((s) => s.hover);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const def = rendererForBlock(block);
  const Icon = def?.icon;
  const isSelected = block.id === selectedBlockId;
  const isHovered = block.id === hoveredBlockId;
  const visible = block.visible !== false;
  const canMoveUp = index > 0;
  const canMoveDown = index < siblingsCount - 1;

  const isContainer = block.type === 'container';
  const container = isContainer ? (block as ContainerBlock) : null;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md py-1 pr-1 text-[12px] transition-colors',
          isSelected
            ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
            : isHovered
              ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
          !visible && 'opacity-50',
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onMouseEnter={() => hover(block.id)}
        onMouseLeave={() => hover(null)}
      >
        {/* Drag handle — only this element triggers a drag, so
            clicking on the row body still selects the block. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={__('Drag layer')}
          title={__('Drag to reorder')}
          className="inline-flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={11} />
        </button>

        <button
          type="button"
          className="flex flex-1 items-center gap-2 truncate text-left"
          onClick={() => select(block.id)}
        >
          {Icon && (
            <Icon
              size={13}
              strokeWidth={1.8}
              className={cn(
                isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
              )}
            />
          )}
          <span className="truncate font-medium">{def?.label ?? block.type}</span>
          <span className="ml-1 truncate text-[11px] font-normal text-[var(--text-muted)]">
            {labelForBlock(block)}
          </span>
        </button>

        <RowAction
          title={__('Move up')}
          disabled={!canMoveUp}
          onClick={() => moveBlockUp(block.id)}
        >
          <ChevronUp size={12} />
        </RowAction>
        <RowAction
          title={__('Move down')}
          disabled={!canMoveDown}
          onClick={() => moveBlockDown(block.id)}
        >
          <ChevronDown size={12} />
        </RowAction>
        <RowAction
          title={visible ? __('Hide') : __('Show')}
          alwaysVisible={!visible}
          onClick={() => updateBlock(block.id, { visible: !visible })}
        >
          {visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </RowAction>
        <RowAction
          title={__('Delete')}
          danger
          onClick={() => deleteBlock(block.id)}
        >
          <Trash2 size={12} />
        </RowAction>
      </div>

      {/* Container children — rendered once per cell so the user
          can drop a layer into an explicit column. */}
      {container && (
        <CellGroup
          containerId={container.id}
          cell="left"
          label={container.columns === 2 ? __('Left cell') : undefined}
          items={container.children}
          depth={depth + 1}
          draggingId={draggingId}
        />
      )}
      {container && container.columns === 2 && (
        <CellGroup
          containerId={container.id}
          cell="right"
          label={__('Right cell')}
          items={Array.isArray(container.right_children) ? container.right_children : []}
          depth={depth + 1}
          draggingId={draggingId}
        />
      )}
    </li>
  );
};

/**
 * Render one cell of a container as an indented sub-list with its
 * own drop target. Empty cells still render the dashed drop zone so
 * the user has somewhere to release a dragged layer.
 */
const CellGroup: FC<{
  containerId: string;
  cell: ContainerCell;
  label: string | undefined;
  items: Block[];
  depth: number;
  draggingId: string | null;
}> = ({ containerId, cell, label, items, depth, draggingId }) => {
  const dropId = layersCellDropId(containerId, cell);
  const { setNodeRef, isOver } = useDroppable({ id: dropId, data: { containerId, cell } });
  // Highlight the drop zone whenever a drag is active and the
  // dragged block isn't already a direct child of this cell — that
  // tells the user "yes, you can drop here".
  const showDropTarget = draggingId !== null && !items.some((c) => c.id === draggingId);

  return (
    <>
      {label && (
        <div
          style={{ paddingLeft: 8 + depth * 14 }}
          className="mt-0.5 flex items-center text-[10px] uppercase tracking-wide text-[var(--text-muted)]"
        >
          {label}
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {items.map((child, childIndex) => (
          <LayerRow
            key={child.id}
            block={child}
            depth={depth}
            index={childIndex}
            siblingsCount={items.length}
            draggingId={draggingId}
          />
        ))}
      </ul>
      <div
        ref={setNodeRef}
        style={{ marginLeft: 8 + depth * 14 }}
        className={cn(
          'mt-0.5 rounded-md border border-dashed px-2 py-1 text-[10.5px] transition-colors',
          isOver && showDropTarget
            ? 'border-[var(--accent)] bg-[var(--bg-selected)] text-[var(--accent)]'
            : 'border-transparent text-[var(--text-muted)]',
          showDropTarget ? 'border-[var(--border-default)]' : '',
        )}
      >
        {showDropTarget
          ? __('Drop into this cell')
          : items.length === 0
            ? __('Empty')
            : ''}
      </div>
    </>
  );
};

interface RowActionProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  alwaysVisible?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}

const RowAction: FC<RowActionProps> = ({
  title,
  onClick,
  disabled,
  alwaysVisible,
  danger,
  children,
}) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={cn(
      'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-opacity',
      'group-hover:opacity-100',
      alwaysVisible ? 'opacity-100' : 'opacity-0',
      'hover:bg-[var(--bg-panel)]',
      danger ? 'hover:text-[var(--danger)]' : 'hover:text-[var(--text-secondary)]',
      'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent',
    )}
  >
    {children}
  </button>
);

/**
 * Best-effort short label for the layer row. Returns the first
 * ~30 chars of content / alt / first social URL, falling back to
 * nothing when the block type doesn't expose any obvious user-
 * facing string.
 */
function labelForBlock(block: Block): string {
  let raw = '';
  switch (block.type) {
    case 'text':
    case 'heading':
    case 'disclaimer':
      raw = stripHtml((block as { content: string }).content);
      break;
    case 'image':
    case 'avatar':
      raw = (block as { alt?: string }).alt ?? '';
      break;
    case 'button_cta':
      raw = (block as { label: string }).label;
      break;
    case 'social_icons': {
      const networks = (block as { networks: Array<{ platform: string }> }).networks;
      raw = networks.map((n) => n.platform).join(', ');
      break;
    }
    case 'contact_row': {
      const rows = (block as { rows: Array<{ icon: string }> }).rows;
      raw = rows.map((r) => r.icon).join(' · ');
      break;
    }
    case 'container': {
      const c = block as ContainerBlock;
      const total = c.children.length + (Array.isArray(c.right_children) ? c.right_children.length : 0);
      raw = `${c.columns}-col, ${total} item${total === 1 ? '' : 's'}`;
      break;
    }
    default:
      raw = '';
  }
  if (!raw) return '';
  return raw.length > 30 ? `${raw.slice(0, 28)}…` : raw;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
