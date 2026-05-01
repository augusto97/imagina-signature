import type { FC } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { __ } from '@/i18n/helpers';
import { ColorInput } from './inputs/ColorInput';
import { DimensionInput } from './inputs/DimensionInput';
import { FontFamilyInput } from './inputs/FontFamilyInput';
import { PropertySection } from './sections/PropertySection';
import { VariablesEditor } from './VariablesEditor';

/**
 * Sidebar contents shown when nothing is selected — controls global
 * canvas attributes (width, default font, background, etc.).
 */
export const CanvasProperties: FC = () => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  const updateCanvas = useSchemaStore((s) => s.updateCanvas);

  return (
    <>
      <PropertySection title={__('Canvas')}>
        <div className="space-y-2.5">
          <DimensionInput
            label={__('Width')}
            value={canvas.width}
            onChange={(v) => updateCanvas({ width: v })}
            min={320}
            max={800}
          />
          <ColorInput
            label={__('Background')}
            value={canvas.background_color}
            onChange={(v) => updateCanvas({ background_color: v })}
          />
        </div>
      </PropertySection>

      <PropertySection title={__('Typography')}>
        <div className="space-y-2.5">
          <FontFamilyInput
            label={__('Default font')}
            value={canvas.font_family}
            onChange={(v) => updateCanvas({ font_family: v })}
          />
          <DimensionInput
            label={__('Default size')}
            value={canvas.font_size}
            onChange={(v) => updateCanvas({ font_size: v })}
            min={10}
            max={24}
          />
          <ColorInput
            label={__('Text color')}
            value={canvas.text_color}
            onChange={(v) => updateCanvas({ text_color: v })}
          />
          <ColorInput
            label={__('Link color')}
            value={canvas.link_color}
            onChange={(v) => updateCanvas({ link_color: v })}
          />
        </div>
      </PropertySection>

      <VariablesEditor />
    </>
  );
};
