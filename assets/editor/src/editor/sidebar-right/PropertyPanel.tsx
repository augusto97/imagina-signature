import type { FC } from 'react';
import type { Block } from '@/core/schema/blocks';
import { rendererForBlock } from '@/core/blocks/registry';
import { useSchemaStore } from '@/stores/schemaStore';
import { __ } from '@/i18n/helpers';
import { PropertySection } from './sections/PropertySection';

interface Props {
  block: Block;
}

/**
 * Resolves the block's `PropertiesPanel` from the registry and
 * renders it, wired to the schema store's `updateBlock` mutator.
 *
 * Blocks that opt into our collapsible section pattern declare
 * `wrap_in_section: false` on their definition so we render the
 * custom panel as-is. Otherwise we wrap their content in a default
 * "Properties" section so the visual hierarchy stays consistent
 * with the canvas-properties view.
 */
export const PropertyPanel: FC<Props> = ({ block }) => {
  const updateBlock = useSchemaStore((s) => s.updateBlock);
  const definition = rendererForBlock(block);

  if (!definition) {
    return (
      <p className="px-3 py-3 text-xs text-[var(--text-muted)]">
        {__('Unknown block type — no properties to show.')}
      </p>
    );
  }

  const Panel = definition.PropertiesPanel as FC<{
    block: Block;
    onChange: (updates: Partial<Block>) => void;
  }>;

  const body = <Panel block={block} onChange={(updates) => updateBlock(block.id, updates)} />;

  // Block panels that use PropertySection internally (Text) opt out
  // of the wrapping by setting wrap_in_section: false on their
  // definition. Everyone else gets a default section so the right
  // sidebar always reads as a clean list of titled groups.
  const useDefaultSection = definition.wrap_in_section !== false;

  if (useDefaultSection) {
    return <PropertySection title={__('Properties')}>{body}</PropertySection>;
  }
  return body;
};
