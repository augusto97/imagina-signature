import type { FC } from 'react';
import { cn } from '@/utils/cn';

interface Props {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}

/** Inline switch with its label on the left. */
export const ToggleInput: FC<Props> = ({ label, checked, onChange, hint }) => (
  <div>
    <div className="flex items-center justify-between gap-2">
      <span className="is-section-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-4 w-7 shrink-0 rounded-full transition-colors',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
    {hint && (
      <span className="mt-1 block text-[10px] leading-tight text-[var(--text-muted)]">{hint}</span>
    )}
  </div>
);
