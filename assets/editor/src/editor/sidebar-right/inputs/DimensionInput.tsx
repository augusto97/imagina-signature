import type { FC } from 'react';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

/**
 * Numeric input with an optional unit suffix and clamp range.
 *
 * Used for sizes, paddings, font sizes — anywhere we want a single
 * positive integer with a visible unit hint.
 */
export const DimensionInput: FC<Props> = ({ label, value, onChange, min = 0, max, step = 1, unit = 'px' }) => (
  <label className="block">
    <span className="mb-1 block text-[var(--text-secondary)]">{label}</span>
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5 text-xs"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      <span className="text-xs text-[var(--text-muted)]">{unit}</span>
    </div>
  </label>
);
