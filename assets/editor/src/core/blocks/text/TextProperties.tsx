import type { FC } from 'react';
import type { TextBlock } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { TiptapEditor } from '@/tiptap/TiptapEditor';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { FontFamilyInput } from '@/editor/sidebar-right/inputs/FontFamilyInput';
import { FontWeightInput } from '@/editor/sidebar-right/inputs/FontWeightInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';

interface Props {
  block: TextBlock;
  onChange: (updates: Partial<TextBlock>) => void;
}

/**
 * Properties panel for a Text block (Sprint 7 wiring).
 *
 * Tiptap edits the content — no contentEditable on the canvas, so
 * cursor-and-selection bugs that plague email editors don't apply.
 * The remaining controls feed `block.style` and `block.padding`.
 */
export const TextProperties: FC<Props> = ({ block, onChange }) => {
  const setStyle = <K extends keyof TextBlock['style']>(key: K, value: TextBlock['style'][K]) => {
    onChange({ style: { ...block.style, [key]: value } });
  };

  return (
    <div className="space-y-4 text-xs">
      <section className="space-y-2">
        <h3 className="text-[var(--text-secondary)]">{__('Content')}</h3>
        <TiptapEditor
          content={block.content}
          onChange={(html) => onChange({ content: html })}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-[var(--text-secondary)]">{__('Typography')}</h3>
        <FontFamilyInput
          label={__('Font')}
          value={block.style.font_family}
          onChange={(v) => setStyle('font_family', v)}
        />
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
        <ColorInput
          label={__('Color')}
          value={block.style.color}
          onChange={(v) => setStyle('color', v)}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-[var(--text-secondary)]">{__('Spacing')}</h3>
        <PaddingInput
          value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }}
          onChange={(p) => onChange({ padding: p })}
        />
      </section>
    </div>
  );
};
