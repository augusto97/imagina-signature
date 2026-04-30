import type { FC } from 'react';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

interface TopbarProps {
  isSaving?: boolean;
  isDirty?: boolean;
  className?: string;
}

/**
 * Editor topbar — 48px high, holds the save indicator + (later)
 * device switcher, undo/redo, preview, and export buttons.
 *
 * Sprint 4 ships the empty shell with the save status so the rest
 * of the editor has something to talk to. The action controls land
 * incrementally in Sprints 6, 7, 9, 10.
 */
export const Topbar: FC<TopbarProps> = ({ isSaving = false, isDirty = false, className }) => {
  let status = __('Saved');
  if (isSaving) status = __('Saving…');
  else if (isDirty) status = __('Unsaved changes');

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-default)] bg-[var(--bg-panel)] px-4',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {__('Imagina Signatures')}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
        <span aria-live="polite">{status}</span>
      </div>
    </header>
  );
};
