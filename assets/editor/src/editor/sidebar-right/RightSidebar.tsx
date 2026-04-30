import type { FC } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { __ } from '@/i18n/helpers';
import { CanvasProperties } from './CanvasProperties';
import { PropertyPanel } from './PropertyPanel';

/**
 * Right sidebar — switches between block properties and canvas
 * properties depending on whether anything is selected.
 */
export const RightSidebar: FC = () => {
  const selectedId = useSelectionStore((s) => s.selectedBlockId);
  const block = useSchemaStore((s) =>
    selectedId ? s.schema.blocks.find((b) => b.id === selectedId) : undefined,
  );

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--border-default)] bg-[var(--bg-panel)]">
      <div className="border-b border-[var(--border-default)] p-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {block ? __('Block properties') : __('Canvas')}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {block ? <PropertyPanel block={block} /> : <CanvasProperties />}
      </div>
    </aside>
  );
};
