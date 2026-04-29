import { ComponentChildren, JSX } from 'preact';
import { useEffect } from 'preact/hooks';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
  footer?: ComponentChildren;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps): JSX.Element | null {
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
      className="is-fixed is-inset-0 is-bg-black/50 is-flex is-items-center is-justify-center is-z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="is-bg-white is-rounded-lg is-shadow-xl is-w-full is-max-w-lg is-mx-4 is-flex is-flex-col is-max-h-[90vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="is-px-5 is-py-4 is-border-b is-border-slate-200 is-flex is-items-center is-justify-between">
          <h2 className="is-text-lg is-font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="is-text-slate-400 hover:is-text-slate-600 is-bg-transparent is-border-0 is-p-1"
            aria-label="Close"
            type="button"
          >
            ×
          </button>
        </header>
        <div className="is-px-5 is-py-4 is-overflow-y-auto is-flex-1">{children}</div>
        {footer && (
          <footer className="is-px-5 is-py-3 is-border-t is-border-slate-200 is-flex is-justify-end is-gap-2 is-bg-slate-50">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
