import { JSX } from 'preact';

interface Option {
  value: string;
  label: string;
}

type SelectAttrs = JSX.IntrinsicElements['select'];

export type SelectProps = Omit<SelectAttrs, 'onChange' | 'value'> & {
  label?: string;
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
};

export function Select({
  label,
  options,
  value,
  onValueChange,
  className = '',
  id,
  ...rest
}: SelectProps): JSX.Element {
  const selectId = typeof id === 'string' ? id : `is-sel-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label className="is-block is-text-sm" htmlFor={selectId}>
      {label && <span className="is-block is-mb-1 is-font-medium is-text-slate-700">{label}</span>}
      <select
        id={selectId}
        value={value}
        onChange={(event) => onValueChange((event.target as HTMLSelectElement).value)}
        className={[
          'is-w-full is-px-3 is-py-2 is-border is-rounded is-bg-white is-border-slate-300',
          'focus:is-outline-none focus:is-ring-2 focus:is-ring-brand-500',
          className as string,
        ].join(' ')}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
