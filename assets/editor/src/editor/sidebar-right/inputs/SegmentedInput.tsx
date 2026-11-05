import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * One option of a segmented control.
 *
 * `label` is what the button shows unless `content` is given (e.g. an
 * icon); `title` is the tooltip / accessible name, falling back to
 * `label` when that is plain text.
 */
export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  title?: string;
  content?: ReactNode;
}

interface Props<T extends string | number> {
  label?: string;
  ariaLabel?: string;
  value: T | undefined;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
}

/** Compact single-choice button group (alignment, units, presets). */
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
          const name = option.title ?? (typeof option.label === 'string' ? option.label : undefined);
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={active}
              title={name}
              aria-label={name}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex h-6 flex-1 items-center justify-center rounded px-1.5 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-[var(--bg-panel)] text-[var(--accent)] shadow-sm ring-1 ring-inset ring-[var(--border-default)]'
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
