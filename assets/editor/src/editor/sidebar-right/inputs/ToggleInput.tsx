import type { FC } from 'react';
import { cn } from '@/utils/cn';

interface Props {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Optional one-line explanation under the label. */
  hint?: string;
  disabled?: boolean;
}

/**
 * Labelled on / off switch (`role="switch"`), the boolean counterpart
 * of the other sidebar inputs.
 */
export const ToggleInput: FC<Props> = ({ label, checked, onChange, hint, disabled }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <span className="block text-[12px] font-medium text-[var(--text-secondary)]">{label}</span>
      {hint && (
        <span className="mt-0.5 block text-[10px] leading-tight text-[var(--text-muted)]">
          {hint}
        </span>
      )}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
      )}
    >
      <span
        className={cn(
          'inline-block h-3 w-3 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-3.5' : 'translate-x-0.5',
        )}
      />
    </button>
  </div>
);
