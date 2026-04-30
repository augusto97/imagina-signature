import type { FC } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { __ } from '@/i18n/helpers';
import { BlockRenderer } from './BlockRenderer';
import { SelectionOverlay } from './SelectionOverlay';
import '@/core/blocks';

/**
 * Editor canvas — renders the schema's block list as live email-safe
 * markup, layered with selection / hover overlays.
 *
 * Click a block to select; click empty canvas to clear selection.
 * Drag-and-drop arrives in Sprint 6.
 */
export const Canvas: FC = () => {
  const schema = useSchemaStore((s) => s.schema);

  const { selectedBlockId, hoveredBlockId, select, hover, clearSelection } = useSelectionStore();

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
      >
        {schema.blocks.length === 0 ? (
          <p className="text-center text-sm text-[var(--text-muted)]">
            {__('Drop blocks from the left sidebar to start your signature.')}
          </p>
        ) : (
          schema.blocks.map((block) => (
            <SelectionOverlay
              key={block.id}
              selected={block.id === selectedBlockId}
              hovered={block.id === hoveredBlockId}
              onSelect={() => select(block.id)}
              onHoverEnter={() => hover(block.id)}
              onHoverLeave={() => hover(null)}
            >
              <BlockRenderer block={block} />
            </SelectionOverlay>
          ))
        )}
      </div>
    </main>
  );
};
