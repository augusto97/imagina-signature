import type { FC } from 'react';
import { getRegisteredBlocks } from '@/core/blocks/registry';
import { BlockCard } from './BlockCard';

/**
 * Grid of block cards.
 *
 * Each card is independently draggable (see {@link BlockCard}) and
 * clickable for low-friction "just add at the end" insertion.
 */
export const BlockLibrary: FC = () => {
  const blocks = getRegisteredBlocks();

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {blocks.map((definition) => (
        <BlockCard
          key={definition.type}
          type={definition.type}
          label={definition.label}
          icon={definition.icon}
        />
      ))}
    </div>
  );
};
