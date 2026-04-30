import type { FC } from 'react';
import { Field } from './_shared';

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
 * Restricted to the web-safe font set per CLAUDE.md §20.1. Email
 * clients vary wildly in what fonts they ship; sticking to web-safe
 * stacks keeps the rendered signature identical across Outlook /
 * Gmail / Apple Mail.
 */
export const FontFamilyInput: FC<Props> = ({ label, value, onChange }) => (
  <Field label={label}>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {WEB_SAFE_FONTS.map((font) => (
        <option key={font.value} value={font.value}>
          {font.label}
        </option>
      ))}
    </select>
  </Field>
);
