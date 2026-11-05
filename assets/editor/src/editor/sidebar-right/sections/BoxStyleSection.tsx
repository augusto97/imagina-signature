import type { FC, ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Plus, X } from 'lucide-react';
import type { BorderSide, BoxAlign, BoxStyle, Padding } from '@/core/schema/styles';
import {
  BOX_SIDES,
  DEFAULT_BOX_BORDER,
  compactBox,
  hasPerSideBorders,
  isBoxEmpty,
  sideKey,
  type BoxSide,
} from '@/core/schema/box';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '../inputs/ColorInput';
import { DimensionInput } from '../inputs/DimensionInput';
import { PaddingInput } from '../inputs/PaddingInput';
import { BorderInput } from '../inputs/BorderInput';
import { SegmentedInput } from '../inputs/SegmentedInput';
import { ToggleInput } from '../inputs/ToggleInput';
import { PropertySection } from './PropertySection';

export interface BoxStyleSectionProps {
  value: BoxStyle | undefined;
  /** Receives the compacted box, or `undefined` when nothing is left. */
  onChange: (box: BoxStyle | undefined) => void;
  /**
   * `block` (default): the generic box around a block — alignment
   * positions the box, a fixed width is available.
   * `column`: a container column — no fixed width (the column width
   * is a percentage), alignment aligns the column's content.
   */
  variant?: 'block' | 'column';
  /** Section title (block variant). Defaults to "Box". */
  title?: string;
  /** Render the fields without the collapsible section wrapper. */
  bare?: boolean;
}

type BorderMode = 'none' | 'all' | 'sides';

const ZERO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_BACKGROUND = '#f3f4f6';
const DEFAULT_WIDTH = 280;

function borderModeOf(box: BoxStyle | undefined): BorderMode {
  if (hasPerSideBorders(box)) return 'sides';
  if (box?.border) return 'all';
  return 'none';
}

/**
 * Generic "Box" styling editor — background (brand swatches via
 * {@link ColorInput}), border (none / uniform / per side), corner
 * radius, inner padding, alignment and an optional fixed width.
 *
 * Appended by the right sidebar's PropertyPanel to EVERY block (it
 * edits `block.box`) and reused by the container panel for each
 * column (`column.box`). Purely controlled: it never touches a store.
 */
export const BoxStyleSection: FC<BoxStyleSectionProps> = ({
  value,
  onChange,
  variant = 'block',
  title,
  bare,
}) => {
  const box = value ?? {};
  const update = (patch: Partial<BoxStyle>): void => onChange(compactBox({ ...box, ...patch }));
  const mode = borderModeOf(value);

  const setMode = (next: BorderMode): void => {
    if (next === mode) return;
    const cleared: Partial<BoxStyle> = { border: undefined };
    for (const side of BOX_SIDES) cleared[sideKey(side)] = undefined;
    if (next === 'none') {
      update(cleared);
    } else if (next === 'all') {
      const seed =
        box.border ?? BOX_SIDES.map((s) => box[sideKey(s)]).find(Boolean) ?? DEFAULT_BOX_BORDER;
      update({ ...cleared, border: seed });
    } else {
      const seed = box.border ?? DEFAULT_BOX_BORDER;
      const sides: Partial<BoxStyle> = { ...cleared };
      for (const side of BOX_SIDES) sides[sideKey(side)] = { ...seed };
      update(sides);
    }
  };

  const sideLabels: Record<BoxSide, string> = {
    top: __('Top'),
    right: __('Right'),
    bottom: __('Bottom'),
    left: __('Left'),
  };

  const alignOptions = [
    { value: 'left' as BoxAlign, label: <AlignLeft size={13} />, title: __('Align left') },
    { value: 'center' as BoxAlign, label: <AlignCenter size={13} />, title: __('Align center') },
    { value: 'right' as BoxAlign, label: <AlignRight size={13} />, title: __('Align right') },
  ];

  const fields = (
    <div className="space-y-3">
      {/* Background */}
      {box.background_color ? (
        <div className="relative">
          <ColorInput
            label={__('Background')}
            value={box.background_color}
            onChange={(background_color) => update({ background_color })}
          />
          <RemoveButton
            label={__('Remove background')}
            onClick={() => update({ background_color: undefined })}
          />
        </div>
      ) : (
        <AddButton onClick={() => update({ background_color: DEFAULT_BACKGROUND })}>
          {__('Add background')}
        </AddButton>
      )}

      {/* Border */}
      <SegmentedInput<BorderMode>
        label={__('Border')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'none', label: __('None') },
          { value: 'all', label: __('All sides') },
          { value: 'sides', label: __('Per side') },
        ]}
      />
      {mode === 'all' && (
        <BorderInput
          value={box.border ?? DEFAULT_BOX_BORDER}
          onChange={(border) => update({ border })}
        />
      )}
      {mode === 'sides' && (
        <div className="space-y-2.5 rounded-md bg-[var(--bg-panel-soft)] p-2 ring-1 ring-inset ring-[var(--border-default)]">
          {BOX_SIDES.map((side) => {
            const key = sideKey(side);
            const current: BorderSide | undefined = box[key];
            return (
              <div key={side} className="space-y-1.5">
                <ToggleInput
                  label={sideLabels[side]}
                  checked={!!current}
                  onChange={(on) =>
                    update({ [key]: on ? { ...(box.border ?? DEFAULT_BOX_BORDER) } : undefined })
                  }
                />
                {current && (
                  <BorderInput value={current} onChange={(next) => update({ [key]: next })} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <DimensionInput
        label={__('Corner radius')}
        value={box.border_radius ?? 0}
        min={0}
        max={64}
        onChange={(v) => update({ border_radius: v > 0 ? v : undefined })}
      />

      <PaddingInput
        label={__('Inner padding')}
        value={box.padding ?? ZERO_PADDING}
        onChange={(padding) => update({ padding })}
      />

      <SegmentedInput<BoxAlign>
        label={variant === 'column' ? __('Content alignment') : __('Alignment')}
        value={box.align ?? 'left'}
        onChange={(align) => update({ align: align === 'left' ? undefined : align })}
        options={alignOptions}
      />

      {variant === 'block' && (
        <div className="space-y-2">
          <ToggleInput
            label={__('Fixed width')}
            hint={__('Narrower than the available space; aligned with the setting above.')}
            checked={Number(box.width) > 0}
            onChange={(on) => update({ width: on ? DEFAULT_WIDTH : undefined })}
          />
          {Number(box.width) > 0 && (
            <DimensionInput
              label={__('Box width')}
              value={box.width ?? DEFAULT_WIDTH}
              min={40}
              max={800}
              onChange={(v) => update({ width: v > 0 ? v : undefined })}
            />
          )}
        </div>
      )}

      {!isBoxEmpty(value) && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-[11px] font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--danger)] hover:underline"
        >
          {__('Reset box styling')}
        </button>
      )}
    </div>
  );

  if (bare) return fields;
  return (
    <PropertySection title={title ?? __('Box')} defaultOpen={!isBoxEmpty(value)}>
      {fields}
    </PropertySection>
  );
};

const AddButton: FC<{ onClick: () => void; children: ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-dashed border-[var(--border-strong)] px-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
  >
    <Plus size={12} />
    {children}
  </button>
);

const RemoveButton: FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    className="absolute right-0 top-0 inline-flex h-4 w-4 items-center justify-center rounded text-[var(--text-muted)] hover:bg-red-50 hover:text-[var(--danger)]"
  >
    <X size={11} />
  </button>
);
