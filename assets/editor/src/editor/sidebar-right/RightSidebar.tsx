import type { FC } from 'react';
import { Settings2 } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { rendererForBlock } from '@/core/blocks/registry';
import { __ } from '@/i18n/helpers';
import { CanvasProperties } from './CanvasProperties';
import { PropertyPanel } from './PropertyPanel';

/**
 * Right sidebar — switches between block properties and canvas
 * properties depending on whether anything is selected. Header
 * surfaces the selected block's type as a small breadcrumb.
 */
export const RightSidebar: FC = () => {
  const selectedId = useSelectionStore((s) => s.selectedBlockId);
  const block = useSchemaStore((s) =>
    selectedId ? s.schema.blocks.find((b) => b.id === selectedId) : undefined,
  );
  const definition = block ? rendererForBlock(block) : null;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--border-default)] bg-[var(--bg-panel)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-default)] px-4">
        <Settings2 size={14} className="text-[var(--text-muted)]" />
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="is-section-label">{block ? __('Block') : __('Canvas')}</span>
          {definition && (
            <>
              <span className="text-[10px] text-[var(--text-muted)]">/</span>
              <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">
                {__(definition.label)}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {block ? <PropertyPanel block={block} /> : <CanvasProperties />}
      </div>
    </aside>
  );
};
