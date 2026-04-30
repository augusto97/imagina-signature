import type { FC } from 'react';
import { getRegisteredBlocks, type BlockCategory, type BlockDefinition } from '@/core/blocks/registry';
import { __ } from '@/i18n/helpers';
import { BlockCard } from './BlockCard';

const CATEGORY_ORDER: BlockCategory[] = ['layout', 'content', 'social'];

const CATEGORY_LABELS: Record<BlockCategory, string> = {
  layout: 'Layout',
  content: 'Content',
  social: 'Social',
};

/**
 * Block library, grouped by category.
 *
 * Each group has an upper-case label header followed by a 2-column
 * grid of cards. Cards are draggable (drop onto canvas) and
 * clickable (append at end) — see {@link BlockCard}.
 */
export const BlockLibrary: FC = () => {
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
            <h3 className="is-section-label mb-2 px-1">{__(CATEGORY_LABELS[category])}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {blocks.map((definition) => (
                <BlockCard
                  key={definition.type}
                  type={definition.type}
                  label={definition.label}
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
