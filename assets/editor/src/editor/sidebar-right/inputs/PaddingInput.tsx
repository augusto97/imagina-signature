import type { FC } from 'react';
import type { Padding } from '@/core/schema/styles';
import { __ } from '@/i18n/helpers';

interface Props {
  value: Padding;
  onChange: (padding: Padding) => void;
}

/**
 * 4-up grid for top / right / bottom / left padding. Each cell shows
 * a side abbreviation and a compact number input, mirroring the box
 * model layout used by Framer / Webflow inspectors.
 */
export const PaddingInput: FC<Props> = ({ value, onChange }) => {
  const set = (side: keyof Padding, next: number) => onChange({ ...value, [side]: next });

  return (
    <div>
      <span className="is-section-label mb-1 block">{__('Padding')}</span>
      <div className="grid grid-cols-2 gap-1.5">
        <Cell label="T" value={value.top} onChange={(v) => set('top', v)} />
        <Cell label="R" value={value.right} onChange={(v) => set('right', v)} />
        <Cell label="B" value={value.bottom} onChange={(v) => set('bottom', v)} />
        <Cell label="L" value={value.left} onChange={(v) => set('left', v)} />
      </div>
    </div>
  );
};

const Cell: FC<{ label: string; value: number; onChange: (v: number) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <label className="relative flex items-center">
    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {label}
    </span>
    <input
      type="number"
      min={0}
      className="w-full pl-6 pr-2 text-right"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  </label>
);
