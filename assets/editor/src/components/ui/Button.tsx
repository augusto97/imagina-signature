import { ComponentChildren, JSX } from 'preact';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type ButtonAttrs = JSX.IntrinsicElements['button'];

export type ButtonProps = Omit<ButtonAttrs, 'size'> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ComponentChildren;
  children?: ComponentChildren;
};

const variants: Record<Variant, string> = {
  primary: 'is-bg-brand-600 hover:is-bg-brand-700 is-text-white',
  secondary:
    'is-bg-slate-100 hover:is-bg-slate-200 is-text-slate-900 is-border is-border-slate-200',
  ghost: 'is-bg-transparent hover:is-bg-slate-100 is-text-slate-700',
  danger: 'is-bg-red-600 hover:is-bg-red-700 is-text-white',
};

const sizes: Record<Size, string> = {
  sm: 'is-px-2 is-py-1 is-text-xs',
  md: 'is-px-3 is-py-1.5 is-text-sm',
  lg: 'is-px-4 is-py-2 is-text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      disabled={disabled || loading}
      className={[
        'is-inline-flex is-items-center is-gap-2 is-rounded is-font-medium is-transition-colors',
        'disabled:is-opacity-50 disabled:is-cursor-not-allowed',
        variants[variant],
        sizes[size],
        className as string,
      ].join(' ')}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

function Spinner(): JSX.Element {
  return (
    <span
      className="is-inline-block is-w-3 is-h-3 is-rounded-full is-border-2 is-border-current is-border-t-transparent is-animate-spin"
      aria-hidden="true"
    />
  );
}
