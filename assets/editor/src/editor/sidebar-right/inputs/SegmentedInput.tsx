import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface SegmentedOption<T extends string | number> {
  value: T;
  /** Visible content (text or an icon). */
  label: ReactNode;
  /** Accessible name / tooltip; required when `label` is an icon. */
  title?: string;
}

interface Props<T extends string | number> {
  /** Field label shown above the control (optional). */
  label?: string;
  /** Accessible name of the group when there is no visible label. */
  ariaLabel?: string;
  value: T | undefined;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
}

/**
 * Compact segmented control (a radio group rendered as joined buttons)
 * for small enumerations: alignment, vertical alignment, column count,
 * border mode…
 */
export function SegmentedInput<T extends string | number>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: Props<T>) {
  return (
    <div>
      {label && <span className="is-section-label mb-1 block">{label}</span>}
      <div
        role="radiogroup"
        aria-label={ariaLabel ?? label}
        className="flex rounded-md bg-[var(--bg-panel-soft)] p-0.5 ring-1 ring-inset ring-[var(--border-default)]"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={active}
              title={option.title}
              aria-label={option.title}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex h-6 flex-1 items-center justify-center rounded px-1.5 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-[var(--bg-panel)] text-[var(--accent)] shadow-sm ring-1 ring-inset ring-[var(--border-default)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
