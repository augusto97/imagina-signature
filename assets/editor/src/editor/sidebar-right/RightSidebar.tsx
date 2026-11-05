import type { FC } from 'react';
import { Settings2 } from 'lucide-react';
import { useSchemaStore, findBlockByIdDeep } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { rendererForBlock } from '@/core/blocks/registry';
import { editableFields, lockedBlockIds } from '@/core/schema/locks';
import { useEditPolicy } from '@/stores/linkStore';
import { __ } from '@/i18n/helpers';
import { CanvasProperties } from './CanvasProperties';
import { PropertyPanel } from './PropertyPanel';
import { ContentOnlyPanel, LockedCanvasPanel, LockedNotice } from './LockedBlockPanel';

/**
 * Right sidebar — switches between block properties and canvas
 * properties depending on whether anything is selected. Header
 * surfaces the selected block's type as a small breadcrumb.
 *
 * Locks (1.3.0): when the lock policy applies, a locked block shows a
 * notice instead of its properties, a `locked_design` template exposes
 * only the text of unlocked text-like blocks, and a fixed canvas shows
 * only the signature's variables.
 */
export const RightSidebar: FC = () => {
  const selectedId = useSelectionStore((s) => s.selectedBlockId);
  // Walks into Container children too, so nested blocks are
  // editable from the same property panel as top-level blocks.
  const block = useSchemaStore((s) =>
    selectedId ? findBlockByIdDeep(s.schema.blocks, selectedId) : undefined,
  );
  const definition = block ? rendererForBlock(block) : null;
  const policy = useEditPolicy();
  const isLocked = useSchemaStore((s) =>
    selectedId ? lockedBlockIds(s.schema.blocks).has(selectedId) : false,
  );
  const fields = block ? editableFields(policy, block, isLocked) : 'all';

  let body: React.ReactNode;
  if (!block) {
    body = policy.canvasLocked ? <LockedCanvasPanel /> : <CanvasProperties />;
  } else if (fields === 'all') {
    body = <PropertyPanel key={block.id} block={block} />;
  } else if (fields.length > 0) {
    body = <ContentOnlyPanel key={block.id} block={block} />;
  } else {
    body = <LockedNotice reason={isLocked ? 'locked' : 'design'} />;
  }

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
                {/* i18n-dynamic: registry labels are listed in i18n/dynamic-strings.ts. */}
                {__(definition.label)}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* Keyed by block id so moving the selection from one block to
            another (or to a block of the same type) mounts a fresh
            panel. Without the key React reused the previous block's
            panel instance — its Tiptap editor kept block A's text and
            typing then wrote that text into block B. */}
        {body}
      </div>
    </aside>
  );
};
