import type { FC } from 'react';
import { __ } from '@/i18n/helpers';

/**
 * Right sidebar — 280px wide, hosts the property panels (canvas-level
 * when nothing is selected, block-level when something is). Sprint 4
 * ships the empty shell; properties land in Sprint 7.
 */
export const RightSidebar: FC = () => {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--border-default)] bg-[var(--bg-panel)]">
      <div className="border-b border-[var(--border-default)] p-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {__('Properties')}
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-xs text-[var(--text-muted)]">
        {__('Select a block to see its properties.')}
      </div>
    </aside>
  );
};
