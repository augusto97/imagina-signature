import { JSX } from 'preact';

type InputAttrs = JSX.IntrinsicElements['input'];

export type InputProps = InputAttrs & {
  label?: string;
  hint?: string;
  error?: string;
};

export function Input({ label, hint, error, className = '', id, ...rest }: InputProps): JSX.Element {
  const inputId = typeof id === 'string' ? id : `is-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label className="is-block is-text-sm" htmlFor={inputId}>
      {label && <span className="is-block is-mb-1 is-font-medium is-text-slate-700">{label}</span>}
      <input
        id={inputId}
        className={[
          'is-w-full is-px-3 is-py-2 is-border is-rounded',
          error ? 'is-border-red-400' : 'is-border-slate-300',
          'focus:is-outline-none focus:is-ring-2 focus:is-ring-brand-500',
          className as string,
        ].join(' ')}
        {...rest}
      />
      {hint && !error && <span className="is-block is-mt-1 is-text-xs is-text-slate-500">{hint}</span>}
      {error && <span className="is-block is-mt-1 is-text-xs is-text-red-600">{error}</span>}
    </label>
  );
}
