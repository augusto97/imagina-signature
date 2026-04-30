import type { FC } from 'react';
import { getRegisteredBlocks } from '@/core/blocks/registry';
import { useSchemaStore } from '@/stores/schemaStore';
import { __ } from '@/i18n/helpers';

/**
 * Grid of block cards. Clicking a card appends a fresh instance
 * to the canvas. Sprint 6 wires drag-from-library so the cards can
 * be dropped at a precise location instead.
 */
export const BlockLibrary: FC = () => {
  const blocks = getRegisteredBlocks();
  const addBlock = useSchemaStore((s) => s.addBlock);

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {blocks.map((definition) => {
        const Icon = definition.icon;
        return (
          <button
            key={definition.type}
            type="button"
            className="flex flex-col items-center gap-1 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-3 text-xs text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
            onClick={() => addBlock(definition.create())}
          >
            <Icon size={20} />
            <span>{__(definition.label)}</span>
          </button>
        );
      })}
    </div>
  );
};
