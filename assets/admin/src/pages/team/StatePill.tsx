import type { FC } from 'react';
import { cn } from '@admin/utils/cn';
import type { Pill, Tone } from './model';

const TONES: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** A status chip plus, under it, its date or reason (full text on hover). */
export const StatePill: FC<{ pill: Pill }> = ({ pill }) => (
  <span className="flex min-w-0 flex-col items-start gap-0.5">
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        TONES[pill.tone],
      )}
    >
      {pill.label}
    </span>
    {pill.detail && (
      <span
        className="line-clamp-2 max-w-[11rem] text-[10.5px] leading-snug text-[var(--text-muted)]"
        title={pill.detail}
      >
        {pill.detail}
      </span>
    )}
  </span>
);
