import { useMemo, type FC } from 'react';
import { MousePointer2 } from 'lucide-react';
import type { ButtonCtaBlock, ButtonPreset } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { AlignInput } from '@/editor/sidebar-right/inputs/AlignInput';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { SegmentedInput } from '@/editor/sidebar-right/inputs/SegmentedInput';
import { ToggleInput } from '@/editor/sidebar-right/inputs/ToggleInput';
import { TypographySection } from '@/editor/sidebar-right/inputs/TypographySection';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';
import { useSchemaStore } from '@/stores/schemaStore';
import { BUTTON_TYPOGRAPHY, inheritedTypography } from '../text/typography';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';
import { ButtonPreview } from './ButtonPreview';
import {
  buttonPreset,
  compileButton,
  readableTextColor,
  resolveButtonSpec,
  vmlButtonWidth,
} from './buttonMarkup';

export { vmlButtonWidth };

/**
 * Button (call to action), v2: presets (solid / outline / pill / text
 * link), padding, typography (canvas-inherited family / size), border,
 * radius, full width and alignment. Bullet-proof markup lives in
 * `buttonMarkup.ts` (shared with the vCard block). Rows saved before
 * 1.2 have none of the v2 fields and keep the v1 look.
 */

const Renderer: FC<{ block: ButtonCtaBlock }> = ({ block }) => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  const spec = useMemo(() => resolveButtonSpec(block, canvas), [block, canvas]);
  return <ButtonPreview spec={spec} />;
};

const Properties: FC<{ block: ButtonCtaBlock; onChange: (u: Partial<ButtonCtaBlock>) => void }> = ({
  block,
  onChange,
}) => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  const preset = buttonPreset(block.preset);
  const isText = preset === 'text';
  const isOutline = preset === 'outline';
  const borderWidth = block.border_width ?? (isOutline ? 2 : 0);
  const fullWidth = !isText && block.full_width === true;

  return (
    <>
      <PropertySection title={__('Button')}>
        <div className="space-y-2.5 text-xs">
          <label className="block">
            <span className="is-section-label mb-1 block">{__('Label')}</span>
            <input
              type="text"
              value={block.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="is-section-label mb-1 block">{__('Link URL')}</span>
            <input
              type="url"
              value={block.href}
              onChange={(e) => onChange({ href: e.target.value })}
            />
          </label>
          <SegmentedInput<ButtonPreset>
            label={__('Style')}
            value={preset}
            onChange={(p) => onChange(applyButtonPreset(block, p))}
            options={[
              { value: 'solid', label: __('Solid') },
              { value: 'outline', label: __('Outline') },
              { value: 'pill', label: __('Pill') },
              { value: 'text', label: __('Text link') },
            ]}
          />
        </div>
      </PropertySection>

      <PropertySection title={__('Colors')}>
        <div className="space-y-2.5">
          {!isText && !isOutline && (
            <ColorInput
              label={__('Background')}
              value={block.background_color}
              onChange={(v) => onChange({ background_color: v })}
            />
          )}
          <ColorInput
            label={__('Text color')}
            value={block.text_color}
            onChange={(v) => onChange({ text_color: v })}
          />
          {!isText && (
            <DimensionInput
              label={__('Border width')}
              value={borderWidth}
              onChange={(v) => onChange({ border_width: v })}
              min={isOutline ? 1 : 0}
              max={8}
            />
          )}
          {!isText && borderWidth > 0 && (
            <ColorInput
              label={__('Border color')}
              value={block.border_color ?? block.background_color}
              onChange={(v) => onChange({ border_color: v })}
            />
          )}
        </div>
      </PropertySection>

      <PropertySection title={__('Layout')}>
        <div className="space-y-2.5">
          {!isText && (
            <div className="grid grid-cols-2 gap-2">
              <DimensionInput
                label={__('Padding X')}
                value={block.padding_x ?? 24}
                onChange={(v) => onChange({ padding_x: v })}
                min={0}
                max={64}
              />
              <DimensionInput
                label={__('Padding Y')}
                value={block.padding_y ?? 12}
                onChange={(v) => onChange({ padding_y: v })}
                min={0}
                max={40}
              />
            </div>
          )}
          {!isText && preset !== 'pill' && (
            <DimensionInput
              label={__('Border radius')}
              value={block.border_radius}
              onChange={(v) => onChange({ border_radius: v })}
              min={0}
              max={32}
            />
          )}
          {!isText && (
            <ToggleInput
              label={__('Full width')}
              checked={fullWidth}
              onChange={(v) => onChange({ full_width: v })}
            />
          )}
          {!fullWidth && (
            <AlignInput value={block.align} onChange={(v) => onChange({ align: v })} />
          )}
        </div>
      </PropertySection>

      <TypographySection
        value={block.style ?? {}}
        onChange={(style) => onChange({ style })}
        inherited={inheritedTypography(canvas, BUTTON_TYPOGRAPHY)}
        hide={['color', 'line_height', 'text_align']}
        sizeRange={[10, 32]}
        defaultOpen={false}
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

/**
 * Store patch for switching `block` to `preset`. Besides the preset it
 * adjusts the colours that would otherwise make the result unreadable:
 * a white label on a fill-less button (outline / text link) takes the
 * button colour, and a label matching the fill when going back to a
 * filled preset turns white.
 */
export function applyButtonPreset(
  block: ButtonCtaBlock,
  preset: ButtonPreset,
): Partial<ButtonCtaBlock> {
  const patch: Partial<ButtonCtaBlock> = { preset };
  const textColor = readableTextColor(block, preset === 'solid' || preset === 'pill');
  if (textColor) patch.text_color = textColor;
  if (preset === 'outline') {
    if (!block.border_width) patch.border_width = 2;
    if (!block.border_color) patch.border_color = block.background_color;
  }
  return patch;
}

function compile(block: ButtonCtaBlock, ctx: CompileContext): string {
  return compileButton(resolveButtonSpec(block, ctx.canvas), block, ctx);
}

const definition: BlockDefinition<ButtonCtaBlock> = {
  type: 'button_cta',
  label: 'Button',
  description: 'Call-to-action button.',
  icon: MousePointer2,
  category: 'content',
  create: (): ButtonCtaBlock => ({
    id: generateId('btn'),
    type: 'button_cta',
    label: __('Book a call'),
    href: 'https://',
    background_color: '#1d4ed8',
    text_color: '#ffffff',
    border_radius: 6,
    preset: 'solid',
    padding_x: 24,
    padding_y: 12,
    align: 'left',
    // No `style`: the label font family and size follow the canvas.
    padding: { top: 8, right: 0, bottom: 8, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
  wrap_in_section: false,
};

registerBlock(definition);
export { definition as buttonCtaDefinition };
