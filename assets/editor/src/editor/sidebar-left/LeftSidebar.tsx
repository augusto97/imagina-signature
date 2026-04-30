import type { FC } from 'react';
import { Layers, Library } from 'lucide-react';
import { __ } from '@/i18n/helpers';
import { BlockLibrary } from './BlockLibrary';
import '@/core/blocks';

/**
 * Left sidebar — currently a single Blocks tab. The Layers panel is
 * stubbed and lands when the schema gets a tree view of the canvas
 * structure (post-MVP).
 */
export const LeftSidebar: FC = () => {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-panel)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-default)] px-4">
        <Library size={14} className="text-[var(--text-muted)]" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">{__('Blocks')}</span>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          title={__('Layers (coming soon)')}
          disabled
        >
          <Layers size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <BlockLibrary />
      </div>
    </aside>
  );
};
