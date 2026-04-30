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
 * Floating per-block toolbar shown when a block is selected.
 *
 * Visual goal: a single soft white pill with three icons; no hard
 * border, just a subtle drop shadow, so it overlays the canvas
 * without competing with the selection outline drawn by
 * {@link SelectionOverlay}.
 */
export const BlockToolbar: FC<Props> = ({ block, dragHandleProps }) => {
  const duplicateBlock = useSchemaStore((s) => s.duplicateBlock);
  const deleteBlock = useSchemaStore((s) => s.deleteBlock);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  return (
    <div
      role="toolbar"
      onClick={(e) => e.stopPropagation()}
      className="absolute -top-3.5 right-0 z-20 flex items-center gap-0 rounded-full bg-white px-1 py-0.5"
      style={{ boxShadow: '0 4px 12px rgba(15, 23, 42, 0.10)' }}
    >
      <button
        type="button"
        title={__('Drag to reorder')}
        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
        {...dragHandleProps}
      >
        <GripVertical size={13} />
      </button>
      <button
        type="button"
        title={__('Duplicate')}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        onClick={() => duplicateBlock(block.id)}
      >
        <Copy size={13} />
      </button>
      <button
        type="button"
        title={__('Delete')}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
        onClick={() => {
          deleteBlock(block.id);
          clearSelection();
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
};
