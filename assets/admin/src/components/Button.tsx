import type { ButtonHTMLAttributes, FC, ReactNode } from 'react';
import { cn } from '@admin/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-white border border-transparent hover:bg-[var(--accent-hover)] shadow-[var(--shadow-xs)]',
  secondary:
    'bg-[var(--bg-panel)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-hover)]',
  ghost: 'bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--bg-hover)]',
  danger:
    'bg-[var(--danger)] text-white border border-transparent hover:opacity-90',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
};

export const Button: FC<Props> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  ...rest
}) => (
  <button
    {...rest}
    className={cn(
      'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      VARIANT_CLASSES[variant],
      SIZE_CLASSES[size],
      className,
    )}
  >
    {icon}
    {children}
  </button>
);
