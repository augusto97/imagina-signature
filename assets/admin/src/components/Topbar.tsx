import type { FC, ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Page-level header — title + optional description + actions slot.
 *
 * Sits below the global breadcrumb (which lives in `Layout`) and
 * gives every page a consistent way to surface its primary CTA on
 * the right.
 */
export const Topbar: FC<Props> = ({ title, description, actions }) => (
  <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-default)] bg-[var(--bg-panel)] px-6 py-5">
    <div className="min-w-0">
      <h1 className="truncate text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
        {title}
      </h1>
      {description && (
        <p className="mt-1 max-w-xl text-[13px] text-[var(--text-secondary)]">{description}</p>
      )}
    </div>
    {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
  </header>
);
