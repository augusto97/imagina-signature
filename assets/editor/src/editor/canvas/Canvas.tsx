import type { FC } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useDeviceStore } from '@/stores/deviceStore';
import { __ } from '@/i18n/helpers';
import { SortableBlock } from './SortableBlock';
import '@/core/blocks';

const MOBILE_WIDTH = 360;

/**
 * Editor canvas — renders the schema's block list inside a
 * SortableContext so each block is reorderable. The DndContext
 * itself lives one level up in {@link EditorShell} so the block
 * library can dispatch drops into the same context.
 *
 * Width adapts to the device-store selection: desktop respects
 * `canvas.width`, mobile clamps to a 360px preview so the user can
 * see how the signature will read on a small client.
 */
export const Canvas: FC = () => {
  const schema = useSchemaStore((s) => s.schema);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const device = useDeviceStore((s) => s.device);

  const width = device === 'mobile' ? Math.min(MOBILE_WIDTH, schema.canvas.width) : schema.canvas.width;

  const canvasStyle: React.CSSProperties = {
    width,
    minHeight: 320,
    background: schema.canvas.background_color,
    fontFamily: schema.canvas.font_family,
    color: schema.canvas.text_color,
    padding: 24,
    transition: 'width 240ms ease',
  };

  return (
    <main
      className="flex flex-1 flex-col items-center overflow-auto bg-[var(--bg-primary)] px-6 py-10"
      onClick={() => clearSelection()}
    >
      <div
        className="is-canvas-root border border-[var(--border-default)] bg-white"
        style={canvasStyle}
        onClick={(e) => e.stopPropagation()}
        id="canvas-empty"
      >
        {schema.blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[var(--border-strong)] text-[var(--text-muted)]">
              <Plus size={16} />
            </span>
            <p className="text-[13px] font-medium text-[var(--text-primary)]">
              {__('Start your signature')}
            </p>
            <p className="max-w-xs text-[12px] text-[var(--text-muted)]">
              {__('Drag a block from the left sidebar, or click one to drop it here.')}
            </p>
          </div>
        ) : (
          <SortableContext
            items={schema.blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {schema.blocks.map((block) => (
              <SortableBlock key={block.id} block={block} />
            ))}
          </SortableContext>
        )}
      </div>
    </main>
  );
};
