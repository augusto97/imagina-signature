import type { FC } from 'react';
import type { TextBlock } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { TiptapEditor } from '@/tiptap/TiptapEditor';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { FontFamilyInput } from '@/editor/sidebar-right/inputs/FontFamilyInput';
import { FontWeightInput } from '@/editor/sidebar-right/inputs/FontWeightInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';

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
  const setStyle = <K extends keyof TextBlock['style']>(key: K, value: TextBlock['style'][K]) => {
    onChange({ style: { ...block.style, [key]: value } });
  };

  return (
    <>
      <PropertySection title={__('Content')}>
        <TiptapEditor
          content={block.content}
          onChange={(html) => onChange({ content: html })}
        />
      </PropertySection>

      <PropertySection title={__('Typography')}>
        <div className="space-y-2.5">
          <FontFamilyInput
            label={__('Font')}
            value={block.style.font_family}
            onChange={(v) => setStyle('font_family', v)}
          />
          <div className="grid grid-cols-2 gap-2">
            <DimensionInput
              label={__('Size')}
              value={block.style.font_size}
              onChange={(v) => setStyle('font_size', v)}
              min={8}
              max={72}
            />
            <FontWeightInput
              label={__('Weight')}
              value={block.style.font_weight}
              onChange={(v) => setStyle('font_weight', v)}
            />
          </div>
          <ColorInput
            label={__('Color')}
            value={block.style.color}
            onChange={(v) => setStyle('color', v)}
          />
        </div>
      </PropertySection>

      <PropertySection title={__('Spacing')} defaultOpen={false}>
        <PaddingInput
          value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }}
          onChange={(p) => onChange({ padding: p })}
        />
      </PropertySection>
    </>
  );
};
