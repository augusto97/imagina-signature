import type { FC } from 'react';
import type { Block } from '@/core/schema/blocks';
import { rendererForBlock } from '@/core/blocks/registry';
import { useSchemaStore } from '@/stores/schemaStore';
import { __ } from '@/i18n/helpers';

interface Props {
  block: Block;
}

/**
 * Resolves the block's `PropertiesPanel` from the registry and
 * renders it, wired to the schema store's `updateBlock` mutator.
 */
export const PropertyPanel: FC<Props> = ({ block }) => {
  const updateBlock = useSchemaStore((s) => s.updateBlock);
  const definition = rendererForBlock(block);

  if (!definition) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        {__('Unknown block type — no properties to show.')}
      </p>
    );
  }

  const Panel = definition.PropertiesPanel as FC<{
    block: Block;
    onChange: (updates: Partial<Block>) => void;
  }>;

  return <Panel block={block} onChange={(updates) => updateBlock(block.id, updates)} />;
};
