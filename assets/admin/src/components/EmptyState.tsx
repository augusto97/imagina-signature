import type { FC, ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export const EmptyState: FC<Props> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-6 py-16 text-center">
    {icon && <div className="mb-4 text-[var(--text-muted)]">{icon}</div>}
    <h3 className="mb-1 text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
    {description && (
      <p className="mb-4 max-w-sm text-[13px] text-[var(--text-secondary)]">{description}</p>
    )}
    {action}
  </div>
);
