import type { FC } from 'react';
import { __ } from '@/i18n/helpers';
import { BlockLibrary } from './BlockLibrary';
import '@/core/blocks';

/**
 * Left sidebar — Sprint 5 surfaces the Blocks tab with a clickable
 * library. Tabs (Blocks / Layers / Templates) wire fully in Sprint 10.
 */
export const LeftSidebar: FC = () => {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-panel)]">
      <div className="border-b border-[var(--border-default)] p-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {__('Blocks')}
      </div>
      <div className="flex-1 overflow-y-auto">
        <BlockLibrary />
      </div>
    </aside>
  );
};
