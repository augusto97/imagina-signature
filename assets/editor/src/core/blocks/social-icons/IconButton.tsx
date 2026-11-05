import type { FC, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface Props {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}

/** Small square icon button for list rows (move up / down, remove). */
export const IconButton: FC<Props> = ({ label, onClick, disabled, danger, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-30',
      danger
        ? 'text-red-600 hover:bg-red-50'
        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
    )}
  >
    {children}
  </button>
);
