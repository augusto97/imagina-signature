import { useState, type FC } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Lock,
  Trash2,
  Unlock,
} from 'lucide-react';
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
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useEditPolicy, useLinkStore } from '@/stores/linkStore';
import { canRestructureBlock, lockedBlockIds } from '@/core/schema/locks';
import { rendererForBlock } from '@/core/blocks/registry';
import { normalizeContactRow } from '@/core/blocks/contact-row/normalize';
import { iconTitle } from '@/core/blocks/social-icons/iconSet';
import { normalizeSocialIcons } from '@/core/blocks/social-icons/normalize';
import type { Block, ContainerBlock } from '@/core/schema/blocks';
import { childLists, collectBlockIds, columnsOf } from '@/core/schema/tree';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

/**
 * Layers panel — hierarchical view of every block on the canvas.
 *
 * Every layer row is a dnd-kit sortable, and container rows expose one
 * "drop zone" row per column so the user can drag a block INTO a
 * specific column. The panel hosts its own `<DndContext>` independent
 * of the canvas DnD; that keeps the two UIs from racing on collision
 * detection (each context has its own pointer sensor and ID space).
 *
 * Drop semantics inside the panel:
 *   - Drop on a regular block row    → move next to that row's block
 *     (uses `moveBlock`, which walks every container column). The rows
 *     shift out of the way while dragging (sortable list), so the side
 *     matches what the user sees: dragging DOWN lands after the target,
 *     dragging UP lands before it — which is what makes "drag to the
 *     very top" work.
 *   - Drop on a column zone of a container → append to that column.
 *
 * The store refuses moves that would nest containers more than one
 * level deep. The chevron + eye + trash buttons stay around — drag is
 * not always faster than a one-click "move up" when the next row is
 * adjacent, and chevrons are accessible to keyboard users by default.
 *
 * Locks (1.3.0): locked rows show a lock icon; template managers get a
 * lock / unlock toggle per row. When the lock policy applies, rows that
 * can't be restructured lose their drag handle and row actions (the
 * store refuses those actions anyway).
 */
const CELL_DROP_PREFIX = 'layers-cell:';
function layersCellDropId(containerId: string, columnId: string): string {
  return `${CELL_DROP_PREFIX}${containerId}:${columnId}`;
}

function parseLayersCellDropId(id: string): { containerId: string; columnId: string } | null {
  if (!id.startsWith(CELL_DROP_PREFIX)) return null;
  const rest = id.substring(CELL_DROP_PREFIX.length);
  const sep = rest.lastIndexOf(':');
  if (sep <= 0 || sep === rest.length - 1) return null;
  return { containerId: rest.slice(0, sep), columnId: rest.slice(sep + 1) };
}

function sortableIndexOf(data: unknown): number | null {
  const index = (data as { sortable?: { index?: unknown } } | undefined)?.sortable?.index;
  return typeof index === 'number' ? index : null;
}

export const LayersPanel: FC = () => {
  const blocks = useSchemaStore((s) => s.schema.blocks);
  const moveBlock = useSchemaStore((s) => s.moveBlock);
  const moveBlockToColumn = useSchemaStore((s) => s.moveBlockToColumn);
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

    // Drop on a column zone → move to that column.
    const cellTarget = parseLayersCellDropId(overId);
    if (cellTarget) {
      moveBlockToColumn(activeId, cellTarget.containerId, cellTarget.columnId);
      return;
    }

    // Drop on another block row → reorder next to it. Rows live in
    // one flat SortableContext (pre-order), so comparing sortable
    // indices tells whether the drag went down (→ after) or up
    // (→ before). `moveBlock` walks every container column, so this
    // works for top-level AND cross-column drags.
    const activeIndex = sortableIndexOf(active.data.current);
    const overIndex = sortableIndexOf(over.data.current);
    const position =
      activeIndex !== null && overIndex !== null && overIndex < activeIndex ? 'before' : 'after';
    moveBlock(activeId, overId, position);
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

  // One flat SortableContext over every block id (pre-order): dnd-kit
  // must know every sortable that participates in the context.
  const allIds = collectBlockIds(blocks);

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

  const policy = useEditPolicy();
  const canManageLocks = useLinkStore((s) => s.canManageLocks);
  const isLocked = useSchemaStore((s) => lockedBlockIds(s.schema.blocks).has(block.id));
  const canRestructure = canRestructureBlock(policy, isLocked);
  const isOwnLock = block.locked === true;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled: !canRestructure,
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
        {canRestructure ? (
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
        ) : (
          <span className="inline-flex h-5 w-4 shrink-0" aria-hidden />
        )}

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
          {/* i18n-dynamic: registry labels are listed in i18n/dynamic-strings.ts. */}
          <span className="truncate font-medium">{def ? __(def.label) : block.type}</span>
          <span className="ml-1 truncate text-[11px] font-normal text-[var(--text-muted)]">
            {labelForBlock(block)}
          </span>
          {isOwnLock && !canManageLocks && (
            <Lock
              size={11}
              className="ml-auto shrink-0 text-[var(--text-muted)]"
              aria-label={__('Locked block')}
            />
          )}
        </button>

        {canManageLocks && (
          <RowAction
            title={isOwnLock ? __('Unlock block') : __('Lock block for employees')}
            alwaysVisible={isOwnLock}
            onClick={() => updateBlock(block.id, { locked: isOwnLock ? undefined : true })}
          >
            {isOwnLock ? <Lock size={12} /> : <Unlock size={12} />}
          </RowAction>
        )}
        {canRestructure && (
          <>
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
            <RowAction title={__('Delete')} danger onClick={() => deleteBlock(block.id)}>
              <Trash2 size={12} />
            </RowAction>
          </>
        )}
      </div>

      {/* Container children — rendered once per column so the user
          can drop a layer into an explicit column. */}
      {container &&
        columnsOf(container).map((column, columnIndex, columns) => (
          <CellGroup
            key={column.id}
            containerId={container.id}
            columnId={column.id}
            label={columns.length > 1 ? __('Column %s', String(columnIndex + 1)) : undefined}
            items={column.children}
            depth={depth + 1}
            draggingId={draggingId}
          />
        ))}
    </li>
  );
};

/**
 * Render one column of a container as an indented sub-list with its
 * own drop target. Empty columns still render the dashed drop zone so
 * the user has somewhere to release a dragged layer.
 */
const CellGroup: FC<{
  containerId: string;
  columnId: string;
  label: string | undefined;
  items: Block[];
  depth: number;
  draggingId: string | null;
}> = ({ containerId, columnId, label, items, depth, draggingId }) => {
  const dropId = layersCellDropId(containerId, columnId);
  const { setNodeRef, isOver } = useDroppable({ id: dropId, data: { containerId, columnId } });
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
          ? __('Drop into this column')
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
    case 'social_icons':
      // v1 (`networks`) and v2 (`items`) alike, via the block's normaliser.
      raw = normalizeSocialIcons(block)
        .items.map((i) => iconTitle(i.network))
        .join(', ');
      break;
    case 'contact_row':
      raw = normalizeContactRow(block)
        .items.map((i) => i.value)
        .filter(Boolean)
        .join(' · ');
      break;
    case 'container': {
      const c = block as ContainerBlock;
      const total = childLists(c).reduce((sum, children) => sum + children.length, 0);
      const count = String(columnsOf(c).length);
      raw =
        total === 1
          ? __('%s-col, 1 item', count)
          : __('%s-col, %s items', count, String(total));
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
