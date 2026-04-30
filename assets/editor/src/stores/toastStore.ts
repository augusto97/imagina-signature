import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, variant?: ToastVariant, duration?: number) => void;
  dismiss: (id: string) => void;
}

/**
 * Simple toast queue. Components subscribe to `toasts` and the
 * `<Toaster />` renders them; consumers fire-and-forget via `show()`.
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (message, variant = 'info', duration = 4000) => {
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, variant, duration }] }));

    if (duration > 0) {
      window.setTimeout(() => get().dismiss(id), duration);
    }
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
