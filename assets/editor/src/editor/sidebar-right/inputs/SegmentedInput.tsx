import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  /** Accessible name / tooltip (already translated). */
  label: string;
  /** Visible content; defaults to `label`. */
  content?: ReactNode;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
}

/**
 * Compact segmented control (alignment, text transform, presets…).
 *
 * Rendered as a `role="radiogroup"` of buttons inside a `<div>` — not
 * the shared `<label>` Field wrapper, which would forward clicks on the
 * caption to the first button.
 */
export function SegmentedInput<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div>
      <span className="is-section-label mb-1 block">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex rounded border border-[var(--border-default)] bg-[var(--bg-hover)] p-0.5"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option.label}
              title={option.label}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex h-6 flex-1 items-center justify-center rounded-sm px-1 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-[var(--bg-panel)] text-[var(--accent)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              {option.content ?? option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
