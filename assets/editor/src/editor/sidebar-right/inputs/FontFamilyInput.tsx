import type { FC } from 'react';

const WEB_SAFE_FONTS = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
] as const;

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Restricted to the web-safe font set per CLAUDE.md §20.1.
 *
 * Email clients vary wildly in what fonts they ship; sticking to
 * web-safe stacks keeps the rendered signature identical across
 * Outlook / Gmail / Apple Mail.
 */
export const FontFamilyInput: FC<Props> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="mb-1 block text-[var(--text-secondary)]">{label}</span>
    <select
      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {WEB_SAFE_FONTS.map((font) => (
        <option key={font.value} value={font.value}>
          {font.label}
        </option>
      ))}
    </select>
  </label>
);
