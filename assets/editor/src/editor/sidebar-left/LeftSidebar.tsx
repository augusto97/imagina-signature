import type { FC } from 'react';
import { __ } from '@/i18n/helpers';

/**
 * Left sidebar — 240px wide, hosts the Blocks / Layers / Templates
 * tabs. Sprint 4 ships an empty shell with a placeholder; tabs and
 * the block library land in Sprints 5-8.
 */
export const LeftSidebar: FC = () => {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-panel)]">
      <div className="border-b border-[var(--border-default)] p-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {__('Blocks')}
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-xs text-[var(--text-muted)]">
        {__('Block library — coming soon.')}
      </div>
    </aside>
  );
};
