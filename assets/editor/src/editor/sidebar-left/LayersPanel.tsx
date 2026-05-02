import type { FC } from 'react';
import { ChevronUp, ChevronDown, Eye, EyeOff, Layers, Trash2 } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { rendererForBlock } from '@/core/blocks/registry';
import type { Block } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

/**
 * Layers panel — hierarchical view of every block on the canvas.
 *
 * Top-level blocks render as flat rows; Container children render
 * indented under their parent. Each row exposes:
 *   - click to select (highlights canvas + opens right-sidebar props)
 *   - hover to highlight on canvas (mirrors SelectionOverlay)
 *   - eye toggle to flip `block.visible`
 *   - up / down arrows to swap with siblings (within the same parent
 *     — top-level rows reorder among top-level, children reorder
 *     within their own column array)
 *   - trash to delete
 *
 * Drag-to-reorder isn't wired here yet — `moveBlockUp` /
 * `moveBlockDown` cover the same intent and avoid a second
 * SortableContext layer.
 */
export const LayersPanel: FC = () => {
  const blocks = useSchemaStore((s) => s.schema.blocks);

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

  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {blocks.map((block, index) => (
        <LayerRow
          key={block.id}
          block={block}
          depth={0}
          index={index}
          siblingsCount={blocks.length}
        />
      ))}
    </ul>
  );
};

interface LayerRowProps {
  block: Block;
  depth: number;
  index: number;
  siblingsCount: number;
}

const LayerRow: FC<LayerRowProps> = ({ block, depth, index, siblingsCount }) => {
  const updateBlock = useSchemaStore((s) => s.updateBlock);
  const deleteBlock = useSchemaStore((s) => s.deleteBlock);
  const moveBlockUp = useSchemaStore((s) => s.moveBlockUp);
  const moveBlockDown = useSchemaStore((s) => s.moveBlockDown);
  // Granular selectors per CLAUDE.md §6.4. Destructuring the full
  // store re-rendered every LayerRow on every selection / hover
  // change.
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId);
  const hoveredBlockId = useSelectionStore((s) => s.hoveredBlockId);
  const select = useSelectionStore((s) => s.select);
  const hover = useSelectionStore((s) => s.hover);

  const def = rendererForBlock(block);
  const Icon = def?.icon;
  const isSelected = block.id === selectedBlockId;
  const isHovered = block.id === hoveredBlockId;
  const visible = block.visible !== false;
  const canMoveUp = index > 0;
  const canMoveDown = index < siblingsCount - 1;

  const isContainer = block.type === 'container';
  const children = isContainer ? (block as { children: Block[] }).children : [];

  return (
    <li>
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

      {isContainer && children.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {children.map((child, childIndex) => (
            <LayerRow
              key={child.id}
              block={child}
              depth={depth + 1}
              index={childIndex}
              siblingsCount={children.length}
            />
          ))}
        </ul>
      )}
    </li>
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
 * Best-effort short label for the layer row.
 *
 * Returns the first ~30 chars of content / alt / first social URL,
 * falling back to nothing when the block type doesn't expose any
 * obvious user-facing string.
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
      const c = block as { columns: 1 | 2; children: Block[] };
      raw = `${c.columns}-col, ${c.children.length} item${c.children.length === 1 ? '' : 's'}`;
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
