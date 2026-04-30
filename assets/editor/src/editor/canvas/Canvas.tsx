import type { FC } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { __ } from '@/i18n/helpers';
import { SortableBlock } from './SortableBlock';
import '@/core/blocks';

/**
 * Editor canvas — renders the schema's block list inside a
 * SortableContext so each block is reorderable. The DndContext
 * itself lives one level up in {@link EditorShell} so the block
 * library can dispatch drops into the same context.
 */
export const Canvas: FC = () => {
  const schema = useSchemaStore((s) => s.schema);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const canvasStyle: React.CSSProperties = {
    width: schema.canvas.width,
    minHeight: 240,
    background: schema.canvas.background_color,
    fontFamily: schema.canvas.font_family,
    color: schema.canvas.text_color,
    padding: 24,
  };

  return (
    <main
      className="flex flex-1 flex-col items-center overflow-y-auto bg-[var(--bg-primary)] p-6"
      onClick={() => clearSelection()}
    >
      <div
        className="is-canvas-root border border-[var(--border-default)]"
        style={canvasStyle}
        onClick={(e) => e.stopPropagation()}
        id="canvas-empty"
      >
        {schema.blocks.length === 0 ? (
          <p className="text-center text-sm text-[var(--text-muted)]">
            {__('Drop blocks from the left sidebar to start your signature.')}
          </p>
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
