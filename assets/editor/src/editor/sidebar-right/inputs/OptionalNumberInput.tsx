import type { FC } from 'react';
import { RotateCcw } from 'lucide-react';
import { __ } from '@/i18n/helpers';
import { Field } from './_shared';

interface Props {
  label: string;
  /** `undefined` = not set (the placeholder shows what applies instead). */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** Value that applies while unset (inherited / block default). */
  placeholder?: number | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Tooltip of the reset button shown while a value is set. */
  resetLabel?: string;
}

/**
 * Number input that can be cleared back to "inherit".
 *
 * Empty input → `undefined`; typed values are clamped to `[min, max]`.
 * While a value is set, a small reset button returns the field to its
 * inherited value.
 */
export const OptionalNumberInput: FC<Props> = ({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step = 1,
  unit,
  resetLabel,
}) => {
  const commit = (raw: string) => {
    if (raw.trim() === '') {
      onChange(undefined);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    let next = n;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(Math.round(next * 100) / 100);
  };

  return (
    <Field label={label}>
      <div className="relative flex items-center">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          className={value !== undefined ? 'pr-12' : 'pr-8'}
          value={value ?? ''}
          placeholder={placeholder !== undefined ? String(placeholder) : undefined}
          onChange={(e) => commit(e.target.value)}
        />
        <span className="pointer-events-none absolute right-2 flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          {unit}
        </span>
        {value !== undefined && (
          <button
            type="button"
            title={resetLabel ?? __('Reset')}
            aria-label={resetLabel ?? __('Reset')}
            onClick={(e) => {
              e.preventDefault();
              onChange(undefined);
            }}
            className="absolute right-7 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <RotateCcw size={10} />
          </button>
        )}
      </div>
    </Field>
  );
};
