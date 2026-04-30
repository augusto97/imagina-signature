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
 *
 * Blocks that opt into our collapsible {@link PropertySection}
 * pattern declare `wrap_in_section: false` on their definition so
 * the panel is rendered as-is (Text uses this). Blocks that don't
 * use sections fall through here and we render their content with
 * a uniform 12px padding so the visual rhythm matches the canvas
 * properties view without an empty "Properties" wrapper.
 */
export const PropertyPanel: FC<Props> = ({ block }) => {
  const updateBlock = useSchemaStore((s) => s.updateBlock);
  const definition = rendererForBlock(block);

  if (!definition) {
    return (
      <p className="px-3 py-3 text-[12px] text-[var(--text-muted)]">
        {__('Unknown block type — no properties to show.')}
      </p>
    );
  }

  const Panel = definition.PropertiesPanel as FC<{
    block: Block;
    onChange: (updates: Partial<Block>) => void;
  }>;

  const body = <Panel block={block} onChange={(updates) => updateBlock(block.id, updates)} />;

  // Blocks that own their layout (Text, ones that internally use
  // PropertySection) render directly. Everything else gets the
  // standard 12px padding so the panel reads as a flat list of
  // controls without an empty "Properties" wrapper section.
  const ownsLayout = definition.wrap_in_section === false;

  if (ownsLayout) {
    return body;
  }
  return <div className="px-3 py-3">{body}</div>;
};
