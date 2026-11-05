import type { FC } from 'react';
import { Lock } from 'lucide-react';
import { getRegisteredBlocks, type BlockCategory, type BlockDefinition } from '@/core/blocks/registry';
import { __ } from '@/i18n/helpers';
import { useEditPolicy } from '@/stores/linkStore';
import { BlockCard } from './BlockCard';

const CATEGORY_ORDER: BlockCategory[] = ['layout', 'content', 'social'];

function categoryLabel(category: BlockCategory): string {
  switch (category) {
    case 'layout':
      return __('Layout');
    case 'content':
      return __('Content');
    case 'social':
      return __('Social');
  }
}

/**
 * Block library, grouped by category.
 *
 * Each group has an upper-case label header followed by a 2-column
 * grid of cards. Cards are draggable (drop onto canvas) and
 * clickable (append at end) — see {@link BlockCard}.
 *
 * When the company template fixes the layout (1.3.0) the library says
 * so instead of offering cards that would be refused.
 */
export const BlockLibrary: FC = () => {
  const policy = useEditPolicy();
  if (policy.structureLocked) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[var(--border-strong)] text-[var(--text-muted)]">
          <Lock size={15} />
        </span>
        <p className="text-[12px] font-medium text-[var(--text-secondary)]">
          {__('The layout is managed by your company template')}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {__('Blocks can’t be added or removed in this signature.')}
        </p>
      </div>
    );
  }
  return <BlockGrid />;
};

const BlockGrid: FC = () => {
  const all = getRegisteredBlocks();
  const grouped = new Map<BlockCategory, BlockDefinition[]>();

  for (const def of all) {
    const list = grouped.get(def.category) ?? [];
    list.push(def);
    grouped.set(def.category, list);
  }

  return (
    <div className="flex flex-col gap-5 px-3 pb-4 pt-3">
      {CATEGORY_ORDER.map((category) => {
        const blocks = grouped.get(category);
        if (!blocks || blocks.length === 0) return null;

        return (
          <section key={category}>
            <h3 className="is-section-label mb-2 px-1">{categoryLabel(category)}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {blocks.map((definition) => (
                <BlockCard
                  key={definition.type}
                  type={definition.type}
                  label={definition.label}
                  description={definition.description}
                  icon={definition.icon}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
