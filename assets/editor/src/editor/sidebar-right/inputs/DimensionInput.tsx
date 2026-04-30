import type { FC } from 'react';
import { Field } from './_shared';

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
export const DimensionInput: FC<Props> = ({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit = 'px',
}) => (
  <Field label={label}>
    <div className="relative">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className="pr-8"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {unit}
      </span>
    </div>
  </Field>
);
