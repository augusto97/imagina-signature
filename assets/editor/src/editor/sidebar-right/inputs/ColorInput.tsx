import type { FC } from 'react';
import { Field } from './_shared';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Native HTML colour picker + hex text input pair. The native
 * control is fast everywhere; the text input lets the user paste a
 * hex code or a CSS named colour.
 */
export const ColorInput: FC<Props> = ({ label, value, onChange }) => (
  <Field label={label}>
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        className="!h-7 !w-9 shrink-0 !p-0.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="text"
        className="flex-1 font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  </Field>
);
