import type { FC } from 'react';
import type { BorderStyle } from '@/core/schema/styles';
import { __ } from '@/i18n/helpers';
import { ColorInput } from './ColorInput';

/** CSS unit suffix (not translated). */
const PX = 'px';

interface Props {
  value: BorderStyle | undefined;
  onChange: (value: BorderStyle) => void;
}

const DEFAULT_BORDER: BorderStyle = { width: 0, style: 'solid', color: '#e5e7eb' };

/**
 * Border width / style / colour for an image. Width 0 means no border;
 * the colour and style are kept so toggling back is one edit.
 */
export const ImageBorderInput: FC<Props> = ({ value, onChange }) => {
  const border = { ...DEFAULT_BORDER, ...(value ?? {}) };
  const set = (patch: Partial<BorderStyle>): void => onChange({ ...border, ...patch });

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="is-section-label mb-1 block">{__('Border')}</span>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={20}
              aria-label={__('Border width (px)')}
              className="pr-8"
              value={border.width}
              onChange={(e) => set({ width: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {PX}
            </span>
          </div>
        </label>
        <label className="block">
          <span className="is-section-label mb-1 block">{__('Style')}</span>
          <select
            value={border.style}
            disabled={border.width === 0}
            aria-label={__('Border style')}
            onChange={(e) => set({ style: e.target.value as BorderStyle['style'] })}
          >
            <option value="solid">{__('Solid')}</option>
            <option value="dashed">{__('Dashed')}</option>
            <option value="dotted">{__('Dotted')}</option>
          </select>
        </label>
      </div>
      {border.width > 0 && (
        <ColorInput label={__('Border color')} value={border.color} onChange={(color) => set({ color })} />
      )}
    </div>
  );
};
