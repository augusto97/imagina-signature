import type { FC } from 'react';
import type { FontWeight } from '@/core/schema/styles';
import { __ } from '@/i18n/helpers';
import { Field } from './_shared';

interface Props {
  label: string;
  value: FontWeight;
  onChange: (value: FontWeight) => void;
}

/** Labels are lazy so they translate at render time. */
const WEIGHTS: Array<{ value: FontWeight; label: () => string }> = [
  { value: 400, label: () => __('Regular') },
  { value: 500, label: () => __('Medium') },
  { value: 600, label: () => __('Semibold') },
  { value: 700, label: () => __('Bold') },
];

/**
 * Restricts font-weight choices to the values email clients
 * reliably honour. Anything other than 400/700 is technically
 * supported but inconsistent across renderers.
 */
export const FontWeightInput: FC<Props> = ({ label, value, onChange }) => (
  <Field label={label}>
    <select value={value} onChange={(e) => onChange(Number(e.target.value) as FontWeight)}>
      {WEIGHTS.map((w) => (
        <option key={w.value} value={w.value}>
          {w.label()}
        </option>
      ))}
    </select>
  </Field>
);
