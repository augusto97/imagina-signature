import { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastOptions {
  duration?: number;
}

let nextId = 1;
let listener: ((toast: ToastMessage) => void) | null = null;

export function pushToast(message: string, type: ToastType = 'info', options: ToastOptions = {}): void {
  if (!listener) return;
  listener({
    id: nextId++,
    message,
    type,
    duration: options.duration ?? 4000,
  });
}

const colors: Record<ToastType, string> = {
  success: 'is-bg-green-700 is-text-white',
  info: 'is-bg-brand-700 is-text-white',
  warning: 'is-bg-amber-700 is-text-white',
  error: 'is-bg-red-700 is-text-white',
};

export function Toaster(): JSX.Element {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    listener = (toast) => {
      setToasts((prev) => [...prev, toast]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, toast.duration);
    };
    return () => {
      listener = null;
    };
  }, []);

  return (
    <div
      className="is-fixed is-bottom-4 is-right-4 is-z-50 is-flex is-flex-col is-gap-2"
      role="region"
      aria-live="polite"
      style={{ maxWidth: '480px' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`is-px-4 is-py-2 is-rounded is-shadow ${colors[toast.type]} is-text-sm`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
