import type { FC } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Native HTML color picker + hex text input pair. The native control
 * is fast on every browser; the text input lets the user paste a
 * hex code (or a CSS named colour) directly.
 */
export const ColorInput: FC<Props> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="mb-1 block text-[var(--text-secondary)]">{label}</span>
    <div className="flex items-center gap-2">
      <input
        type="color"
        className="h-8 w-10 cursor-pointer rounded border border-[var(--border-default)] bg-[var(--bg-panel)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="text"
        className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5 font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  </label>
);
