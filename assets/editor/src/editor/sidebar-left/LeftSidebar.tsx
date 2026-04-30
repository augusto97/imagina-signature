import type { FC } from 'react';
import { Library, Layers } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { BlockLibrary } from './BlockLibrary';
import { LayersPanel } from './LayersPanel';
import '@/core/blocks';

const TABS = [
  { value: 'blocks' as const, label: 'Blocks', icon: Library },
  { value: 'layers' as const, label: 'Layers', icon: Layers },
];

/**
 * Left sidebar: switches between the Blocks library and the Layers
 * tree of the current canvas. Active tab lives in
 * {@link useEditorStore.leftSidebarTab} so other surfaces (keyboard
 * shortcuts, etc.) can drive the same state.
 */
export const LeftSidebar: FC = () => {
  const tab = useEditorStore((s) => s.leftSidebarTab);
  const setTab = useEditorStore((s) => s.setLeftSidebarTab);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-panel)]">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--border-default)] px-2">
        {TABS.map(({ value, label, icon: Icon }) => {
          const active = tab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors',
                active
                  ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon size={13} strokeWidth={1.8} />
              {__(label)}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'blocks' && <BlockLibrary />}
        {tab === 'layers' && <LayersPanel />}
      </div>
    </aside>
  );
};
