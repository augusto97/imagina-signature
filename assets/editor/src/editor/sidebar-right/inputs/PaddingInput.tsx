import type { FC } from 'react';
import type { Padding } from '@/core/schema/styles';
import { __ } from '@/i18n/helpers';

interface Props {
  value: Padding;
  onChange: (padding: Padding) => void;
}

/**
 * 4-up grid for top / right / bottom / left padding values.
 *
 * Each cell is a small number input; the 4-up layout matches the
 * mental model of a CSS box.
 */
export const PaddingInput: FC<Props> = ({ value, onChange }) => {
  const set = (side: keyof Padding, next: number) => onChange({ ...value, [side]: next });

  return (
    <div className="space-y-1">
      <span className="block text-[var(--text-secondary)]">{__('Padding (px)')}</span>
      <div className="grid grid-cols-2 gap-1">
        <Field label={__('Top')} value={value.top} onChange={(v) => set('top', v)} />
        <Field label={__('Right')} value={value.right} onChange={(v) => set('right', v)} />
        <Field label={__('Bottom')} value={value.bottom} onChange={(v) => set('bottom', v)} />
        <Field label={__('Left')} value={value.left} onChange={(v) => set('left', v)} />
      </div>
    </div>
  );
};

const Field: FC<{ label: string; value: number; onChange: (v: number) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <label className="flex items-center gap-1">
    <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
    <input
      type="number"
      min={0}
      className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1 text-xs"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  </label>
);
