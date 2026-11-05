import type { FC } from 'react';
import type { TextBlock } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { TiptapEditor } from '@/tiptap/TiptapEditor';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { TypographySection } from '@/editor/sidebar-right/inputs/TypographySection';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';
import { useSchemaStore } from '@/stores/schemaStore';
import { TEXT_TYPOGRAPHY, inheritedTypography } from './typography';

interface Props {
  block: TextBlock;
  onChange: (updates: Partial<TextBlock>) => void;
}

/**
 * Properties panel for a Text block, organised in collapsible
 * sections (Content / Typography / Spacing) that match the
 * Framer-style inspector.
 */
export const TextProperties: FC<Props> = ({ block, onChange }) => {
  const canvas = useSchemaStore((s) => s.schema.canvas);

  return (
    <>
      <PropertySection title={__('Content')}>
        <TiptapEditor content={block.content} onChange={(html) => onChange({ content: html })} />
      </PropertySection>

      <TypographySection
        value={block.style}
        onChange={(style) => onChange({ style })}
        inherited={inheritedTypography(canvas, TEXT_TYPOGRAPHY)}
      />

      <PropertySection title={__('Spacing')} defaultOpen={false}>
        <PaddingInput
          value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }}
          onChange={(p) => onChange({ padding: p })}
        />
      </PropertySection>
    </>
  );
};
