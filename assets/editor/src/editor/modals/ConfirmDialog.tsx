import { useEffect, type FC, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` paints the confirm button red for destructive actions. */
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-app confirmation dialog (replaces `window.confirm`, which is
 * blocking, unstyled and suppressed by some browsers).
 *
 * Renders as its own fixed layer above any open {@link Modal}. Escape
 * cancels THIS dialog only: the key handler runs in the capture phase
 * on `window` and stops propagation, so the underlying modal's own
 * Escape listener (and the editor's global shortcuts) never see it.
 * The confirm button is focused on open so Enter confirms.
 */
export const ConfirmDialog: FC<ConfirmDialogProps> = ({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="imgsig-confirm-title"
        className="w-full max-w-sm rounded-lg bg-[var(--bg-panel)] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-[var(--bg-selected)] text-[var(--accent)]',
            )}
          >
            <AlertTriangle size={16} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 id="imgsig-confirm-title" className="text-[13px] font-semibold text-[var(--text-primary)]">
              {title}
            </h3>
            <div className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{children}</div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md border border-[var(--border-default)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            {cancelLabel ?? __('Cancel')}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={cn(
              'h-8 rounded-md px-3 text-[12px] font-medium text-white transition-colors',
              tone === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
