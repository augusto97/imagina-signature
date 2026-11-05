import type { FC } from 'react';
import type { BorderLineStyle, BorderSide } from '@/core/schema/styles';
import { __ } from '@/i18n/helpers';
import { ColorInput } from './ColorInput';

interface Props {
  /** Optional heading (e.g. "Top"); omitted for a single uniform border. */
  label?: string;
  value: BorderSide;
  onChange: (value: BorderSide) => void;
  /** Max width in px (default 20). */
  maxWidth?: number;
}

/**
 * Width + line style + colour editor for one {@link BorderSide}. Used
 * by the Box section (uniform border and each side) and the container
 * divider.
 */
export const BorderInput: FC<Props> = ({ label, value, onChange, maxWidth = 20 }) => {
  const set = (patch: Partial<BorderSide>) => onChange({ ...value, ...patch });
  const styles: ReadonlyArray<{ value: BorderLineStyle; label: string }> = [
    { value: 'solid', label: __('Solid') },
    { value: 'dashed', label: __('Dashed') },
    { value: 'dotted', label: __('Dotted') },
  ];

  return (
    <div className="space-y-1.5">
      {label && <span className="is-section-label block">{label}</span>}
      <div className="grid grid-cols-2 gap-1.5">
        <label className="relative flex items-center">
          <input
            type="number"
            min={0}
            max={maxWidth}
            aria-label={__('Border width')}
            className="w-full pr-7 text-right"
            value={value.width}
            onChange={(e) =>
              set({ width: Math.max(0, Math.min(maxWidth, Number(e.target.value) || 0)) })
            }
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            px
          </span>
        </label>
        <select
          aria-label={__('Border style')}
          value={value.style}
          onChange={(e) => set({ style: e.target.value as BorderLineStyle })}
        >
          {styles.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <ColorInput label={__('Color')} value={value.color} onChange={(color) => set({ color })} />
    </div>
  );
};
