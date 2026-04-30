import { useEffect, type FC, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { __ } from '@admin/i18n';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Width in px — default 480. */
  width?: number;
}

/**
 * Lightweight modal — backdrop + centred panel + header. Closes on
 * Esc and on backdrop click; the dialog itself swallows clicks so
 * only chrome dismisses it.
 *
 * Intentionally small (no animation library, no portal): wp-admin
 * has no other Imagina overlays competing for the same z-index, and
 * `position: fixed` from `#imagina-admin-root` already establishes
 * a stacking context.
 */
export const Modal: FC<Props> = ({ open, title, onClose, children, footer, width = 480 }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 px-4 py-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-full flex-col overflow-hidden rounded-xl bg-[var(--bg-panel)] shadow-[var(--shadow-lg)] ring-1 ring-black/5"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            title={__('Close')}
          >
            <X size={14} />
          </button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};
