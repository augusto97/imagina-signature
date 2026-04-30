import type { FC, ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

/**
 * Shared label + control wrapper used by every property input.
 *
 * The label is uppercase / tracked / muted to match the section
 * headers, and an optional one-line hint can be set below the
 * control without breaking alignment with sibling fields.
 */
export const Field: FC<FieldProps> = ({ label, hint, children }) => (
  <label className="block">
    <span className="is-section-label mb-1 block">{label}</span>
    {children}
    {hint && (
      <span className="mt-1 block text-[10px] leading-tight text-[var(--text-muted)]">{hint}</span>
    )}
  </label>
);
