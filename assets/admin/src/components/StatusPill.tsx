import type { FC } from 'react';
import { cn } from '@admin/utils/cn';

type Status = 'draft' | 'ready' | 'archived';

interface Props {
  status: Status;
}

const LABEL: Record<Status, string> = {
  draft: 'Draft',
  ready: 'Ready',
  archived: 'Archived',
};

const COLOR: Record<Status, string> = {
  draft: 'bg-amber-50 text-amber-700 ring-amber-200',
  ready: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  archived: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export const StatusPill: FC<Props> = ({ status }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
      COLOR[status],
    )}
  >
    {LABEL[status]}
  </span>
);
