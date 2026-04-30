import type { FC } from 'react';
import type { FontWeight } from '@/core/schema/styles';

interface Props {
  label: string;
  value: FontWeight;
  onChange: (value: FontWeight) => void;
}

const WEIGHTS: Array<{ value: FontWeight; label: string }> = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
];

/**
 * Restricts font-weight choices to the values email clients
 * reliably honour. Anything other than 400/700 is technically
 * supported but inconsistent across renderers — keeping the
 * options short reduces support pain.
 */
export const FontWeightInput: FC<Props> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="mb-1 block text-[var(--text-secondary)]">{label}</span>
    <select
      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5 text-xs"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as FontWeight)}
    >
      {WEIGHTS.map((w) => (
        <option key={w.value} value={w.value}>
          {w.label}
        </option>
      ))}
    </select>
  </label>
);
