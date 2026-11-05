import type { FC, HTMLAttributes, ReactNode } from 'react';
import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2 } from 'lucide-react';
import type { Block } from '@/core/schema/blocks';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { getSiblingPosition } from '@/stores/schemaUtils';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

interface Props {
  block: Block;
  dragHandleProps: HTMLAttributes<HTMLButtonElement>;
}

/**
 * Floating per-block toolbar shown when a block is selected — for
 * top-level blocks and for blocks nested in container cells alike.
 *
 * Actions: drag handle, move up / down (within the block's current
 * parent: the canvas root or its container cell), duplicate, delete.
 * Move buttons disable at the ends of the sibling list.
 *
 * Visual goal: a single soft white pill with icons; no hard border,
 * just a subtle drop shadow, so it overlays the canvas without
 * competing with the selection outline drawn by SelectionOverlay.
 */
export const BlockToolbar: FC<Props> = ({ block, dragHandleProps }) => {
  const duplicateBlock = useSchemaStore((s) => s.duplicateBlock);
  const deleteBlock = useSchemaStore((s) => s.deleteBlock);
  const moveBlockUp = useSchemaStore((s) => s.moveBlockUp);
  const moveBlockDown = useSchemaStore((s) => s.moveBlockDown);
  const canMoveUp = useSchemaStore(
    (s) => (getSiblingPosition(s.schema.blocks, block.id)?.index ?? 0) > 0,
  );
  const canMoveDown = useSchemaStore((s) => {
    const pos = getSiblingPosition(s.schema.blocks, block.id);
    return pos !== null && pos.index < pos.count - 1;
  });
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  return (
    <div
      role="toolbar"
      aria-label={__('Block actions')}
      onClick={(e) => e.stopPropagation()}
      onMouseOver={(e) => e.stopPropagation()}
      className="absolute -top-3.5 right-0 z-20 flex items-center gap-0 rounded-full bg-white px-1 py-0.5"
      style={{ boxShadow: '0 4px 12px rgba(15, 23, 42, 0.10)' }}
    >
      <button
        type="button"
        title={__('Drag to reorder')}
        aria-label={__('Drag to reorder')}
        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
        {...dragHandleProps}
      >
        <GripVertical size={13} />
      </button>
      <ToolbarButton
        label={__('Move up')}
        disabled={!canMoveUp}
        onClick={() => moveBlockUp(block.id)}
      >
        <ChevronUp size={13} />
      </ToolbarButton>
      <ToolbarButton
        label={__('Move down')}
        disabled={!canMoveDown}
        onClick={() => moveBlockDown(block.id)}
      >
        <ChevronDown size={13} />
      </ToolbarButton>
      <ToolbarButton label={__('Duplicate')} onClick={() => duplicateBlock(block.id)}>
        <Copy size={13} />
      </ToolbarButton>
      <ToolbarButton
        label={__('Delete')}
        danger
        onClick={() => {
          deleteBlock(block.id);
          clearSelection();
        }}
      >
        <Trash2 size={13} />
      </ToolbarButton>
    </div>
  );
};

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}

const ToolbarButton: FC<ToolbarButtonProps> = ({ label, onClick, disabled, danger, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors',
      'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent',
      danger
        ? 'text-red-500 hover:bg-red-50 hover:text-red-600'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
    )}
  >
    {children}
  </button>
);
