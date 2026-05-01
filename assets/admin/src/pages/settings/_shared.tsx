import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { __ } from '@admin/i18n';

/**
 * Form section with title + optional description, used inside the
 * Settings tabs. Mirrors the row spacing the Storage tab inherited
 * from the original SettingsPage layout.
 */
export const Section: FC<{
  title: string;
  description?: string;
  children: ReactNode;
}> = ({ title, description, children }) => (
  <section className="space-y-3 border-b border-[var(--border-default)] px-5 py-5 last:border-b-0">
    <header>
      <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h2>
      {description && (
        <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{description}</p>
      )}
    </header>
    <div className="space-y-3">{children}</div>
  </section>
);

export const Field: FC<{
  label: string;
  hint?: string;
  children: ReactNode;
}> = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
      {label}
    </span>
    {children}
    {hint && <span className="mt-1 block text-[11px] text-[var(--text-muted)]">{hint}</span>}
  </label>
);

export const Banner: FC<{
  type: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}> = ({ type, message, onDismiss }) => (
  <div
    className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-[13px] ${
      type === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-red-200 bg-red-50 text-red-800'
    }`}
  >
    {type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
    <span className="flex-1">{message}</span>
    <button
      type="button"
      className="text-[11px] uppercase tracking-wide opacity-70 hover:opacity-100"
      onClick={onDismiss}
    >
      {__('Dismiss')}
    </button>
  </div>
);

export type FlashType = 'success' | 'error';
export interface Flash {
  type: FlashType;
  message: string;
}
