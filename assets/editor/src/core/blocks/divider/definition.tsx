import { useMemo, type FC } from 'react';
import { Minus } from 'lucide-react';
import type { DividerBlock } from '@/core/schema/blocks';
import type { BorderStyle, Padding } from '@/core/schema/styles';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import {
  borderStyle,
  horizontalPadding,
  intPx,
  paddingCss,
  px,
  safeColor,
} from '@/core/compiler/css';
import { AlignInput } from '@/editor/sidebar-right/inputs/AlignInput';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { SegmentedInput } from '@/editor/sidebar-right/inputs/SegmentedInput';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';
import { useSchemaStore } from '@/stores/schemaStore';
import {
  alignedRow,
  alignMargin,
  alignMarginCss,
  blockAlign,
  tableAlignAttr,
} from '../text/blockLayout';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

/**
 * Divider v2: line style (solid / dashed / dotted), thickness, colour,
 * length (% of the available width or px), alignment and the space
 * above / below (top / bottom padding).
 *
 * Email-safe horizontal rule: the line is the top border of a 1px-high
 * table cell holding a `&nbsp;` at font-size / line-height 1px (an empty
 * `<div style="border-top">` renders as a tall empty paragraph in
 * Outlook and is deleted by the rich-text clipboard path). The line's
 * table is sized to the requested length and positioned inside a
 * full-width row that carries the block padding.
 */

export interface DividerSpec {
  border: string;
  style: BorderStyle['style'];
  thickness: number;
  color: string;
  align: 'left' | 'center' | 'right';
  /** HTML `width` attribute value ("30%" or "120"). */
  widthAttr: string;
  /** CSS width ("30%" or "120px"). */
  widthCss: string;
  /** True when the line spans the whole available width. */
  full: boolean;
}

/** Validates a divider for the given available width (px). */
export function resolveDivider(block: DividerBlock, availableWidth: number): DividerSpec {
  const style = borderStyle(block.border?.style) as BorderStyle['style'];
  const thickness = px(block.border?.width, 0, 20, 1);
  const color = safeColor(block.border?.color, '#e5e7eb');
  const available = Math.max(1, Math.floor(availableWidth - horizontalPadding(block.padding)));

  let widthAttr: string;
  let widthCss: string;
  let full: boolean;
  if (block.width_unit === 'px') {
    const w = Math.min(intPx(block.width_px, 1, 4000, available), available);
    widthAttr = String(w);
    widthCss = `${w}px`;
    full = w >= available;
  } else {
    const pct = intPx(block.width_percent, 1, 100, 100);
    widthAttr = `${pct}%`;
    widthCss = `${pct}%`;
    full = pct >= 100;
  }

  return {
    border: `${thickness}px ${style} ${color}`,
    style,
    thickness,
    color,
    align: blockAlign(block.align),
    widthAttr,
    widthCss,
    full,
  };
}

const Renderer: FC<{ block: DividerBlock }> = ({ block }) => {
  const canvasWidth = useSchemaStore((s) => s.schema.canvas.width);
  const spec = useMemo(() => resolveDivider(block, canvasWidth), [block, canvasWidth]);
  const padding = block.padding;

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse', width: '100%' }}
    >
      <tbody>
        <tr>
          <td
            align={spec.align}
            style={{
              padding: padding
                ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
                : '0',
              textAlign: spec.align,
            }}
          >
            {/* Mirrors the compiled markup (see compile()). */}
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              border={0}
              style={{
                borderCollapse: 'collapse',
                width: spec.widthCss,
                maxWidth: '100%',
                ...alignMarginCss(spec.align),
              }}
            >
              <tbody>
                <tr>
                  <td
                    height={1}
                    style={{
                      borderTop: spec.border,
                      fontSize: '1px',
                      lineHeight: '1px',
                      height: 1,
                    }}
                  >
                    &nbsp;
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
};

const LineSample: FC<{ style: BorderStyle['style'] }> = ({ style }) => (
  <span
    aria-hidden="true"
    className="block w-6"
    style={{ borderTop: `2px ${style} currentColor` }}
  />
);

const Properties: FC<{
  block: DividerBlock;
  onChange: (updates: Partial<DividerBlock>) => void;
}> = ({ block, onChange }) => {
  const unit = block.width_unit === 'px' ? 'px' : 'percent';
  const padding: Padding = block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const setBorder = (patch: Partial<BorderStyle>) =>
    onChange({ border: { ...block.border, ...patch } });
  const fullWidth = unit === 'percent' && (block.width_percent ?? 100) >= 100;

  return (
    <>
      <PropertySection title={__('Line')}>
        <div className="space-y-2.5">
          <SegmentedInput<BorderStyle['style']>
            label={__('Style')}
            value={borderStyle(block.border?.style) as BorderStyle['style']}
            onChange={(v) => setBorder({ style: v })}
            options={[
              { value: 'solid', label: __('Solid'), content: <LineSample style="solid" /> },
              { value: 'dashed', label: __('Dashed'), content: <LineSample style="dashed" /> },
              { value: 'dotted', label: __('Dotted'), content: <LineSample style="dotted" /> },
            ]}
          />
          <DimensionInput
            label={__('Thickness (px)')}
            value={block.border?.width ?? 1}
            onChange={(v) => setBorder({ width: Math.max(1, Math.min(10, v)) })}
            min={1}
            max={10}
          />
          <ColorInput
            label={__('Color')}
            value={block.border?.color ?? '#e5e7eb'}
            onChange={(v) => setBorder({ color: v })}
          />
        </div>
      </PropertySection>

      <PropertySection title={__('Layout')}>
        <div className="space-y-2.5">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            {unit === 'px' ? (
              <DimensionInput
                label={__('Width')}
                value={block.width_px ?? 200}
                onChange={(v) => onChange({ width_px: Math.max(1, v) })}
                min={1}
                max={800}
              />
            ) : (
              <DimensionInput
                label={__('Width')}
                value={block.width_percent ?? 100}
                onChange={(v) => onChange({ width_percent: Math.max(1, Math.min(100, v)) })}
                min={1}
                max={100}
                unit="%"
              />
            )}
            <SegmentedInput<'percent' | 'px'>
              label={__('Unit')}
              value={unit}
              onChange={(v) => onChange({ width_unit: v })}
              options={[
                { value: 'percent', label: __('Percent of the available width'), content: '%' },
                { value: 'px', label: __('Pixels'), content: 'px' },
              ]}
            />
          </div>
          {!fullWidth && (
            <AlignInput value={block.align} onChange={(v) => onChange({ align: v })} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <DimensionInput
              label={__('Space above')}
              value={padding.top}
              onChange={(v) => onChange({ padding: { ...padding, top: Math.max(0, v) } })}
              min={0}
              max={80}
            />
            <DimensionInput
              label={__('Space below')}
              value={padding.bottom}
              onChange={(v) => onChange({ padding: { ...padding, bottom: Math.max(0, v) } })}
              min={0}
              max={80}
            />
          </div>
        </div>
      </PropertySection>
    </>
  );
};

function compile(block: DividerBlock, ctx: CompileContext): string {
  const spec = resolveDivider(block, ctx.availableWidth);
  const margin = alignMargin(spec.align);
  const lineTableStyle = `border-collapse:collapse;width:${spec.widthCss}${margin ? `;margin:${margin}` : ''}`;
  const line = `<table role="presentation" width="${spec.widthAttr}"${tableAlignAttr(spec.align)} cellpadding="0" cellspacing="0" border="0" style="${lineTableStyle}"><tr><td height="1" style="border-top:${spec.border};font-size:1px;line-height:1px;height:1px">&nbsp;</td></tr></table>`;
  return alignedRow(line, spec.align, paddingCss(block.padding));
}

const definition: BlockDefinition<DividerBlock> = {
  type: 'divider',
  label: 'Divider',
  description: 'Horizontal line.',
  icon: Minus,
  category: 'layout',

  create: (): DividerBlock => ({
    id: generateId('div'),
    type: 'divider',
    border: { width: 1, color: '#e5e7eb', style: 'solid' },
    width_percent: 100,
    width_unit: 'percent',
    align: 'left',
    padding: { top: 8, right: 0, bottom: 8, left: 0 },
  }),

  Renderer,
  PropertiesPanel: Properties,
  compile,
  wrap_in_section: false,
};

registerBlock(definition);

export { definition as dividerDefinition };
