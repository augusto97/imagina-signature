import type { FC, HTMLAttributes } from 'react';
import { Copy, GripVertical, Trash2 } from 'lucide-react';
import type { Block } from '@/core/schema/blocks';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { __ } from '@/i18n/helpers';

interface Props {
  block: Block;
  dragHandleProps: HTMLAttributes<HTMLButtonElement>;
}

/**
 * Floating per-block toolbar. Shows up when a block is selected
 * with three actions: duplicate, delete, and a drag handle that
 * forwards the dnd-kit listeners.
 */
export const BlockToolbar: FC<Props> = ({ block, dragHandleProps }) => {
  const duplicateBlock = useSchemaStore((s) => s.duplicateBlock);
  const deleteBlock = useSchemaStore((s) => s.deleteBlock);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  return (
    <div
      className="absolute -top-3 right-0 z-10 flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-1 py-0.5 shadow-sm"
      onClick={(e) => e.stopPropagation()}
      role="toolbar"
    >
      <button
        type="button"
        title={__('Drag to reorder')}
        className="cursor-grab rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] active:cursor-grabbing"
        {...dragHandleProps}
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        title={__('Duplicate')}
        className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        onClick={() => duplicateBlock(block.id)}
      >
        <Copy size={14} />
      </button>
      <button
        type="button"
        title={__('Delete')}
        className="rounded p-1 text-red-600 hover:bg-red-50"
        onClick={() => {
          deleteBlock(block.id);
          clearSelection();
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};
