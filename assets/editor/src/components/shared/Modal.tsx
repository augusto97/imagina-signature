import type { FC, ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

/**
 * Lightweight modal — overlay + centred panel, no Radix yet.
 * Sprint 11 polishes this with Framer Motion entry/exit animations
 * and trap-focus / aria-modal semantics.
 */
export const Modal: FC<Props> = ({ open, title, onClose, children, width = 560 }) => {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] overflow-auto rounded-lg bg-[var(--bg-panel)] shadow-xl"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};
