import type { FC, ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Page-level header — title + optional description + actions slot.
 *
 * Sized to mirror the Imagina Proposals reference: 19px semibold
 * title, generous vertical padding, actions group right-aligned.
 */
export const Topbar: FC<Props> = ({ title, description, actions }) => (
  <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-default)] bg-[var(--bg-panel)] px-7 py-6">
    <div className="min-w-0">
      <h1 className="truncate text-[19px] font-semibold tracking-tight text-[var(--text-primary)]">
        {title}
      </h1>
      {description && (
        <p className="mt-1 max-w-xl text-[13px] text-[var(--text-secondary)]">{description}</p>
      )}
    </div>
    {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
  </header>
);
