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
 * Per-toast auto-dismiss timer ids, tracked outside the store so a
 * manual `dismiss()` (user clicked the X) can `clearTimeout()` and
 * not race the auto-dismiss firing on a no-longer-present toast.
 * Without this the timer would still fire after manual dismiss and
 * call `dismiss(id)` on a missing entry — a no-op, but each
 * autosave-failure burst leaks one timer per toast.
 */
const dismissTimers = new Map<string, number>();

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
      const timer = window.setTimeout(() => {
        dismissTimers.delete(id);
        get().dismiss(id);
      }, duration);
      dismissTimers.set(id, timer);
    }
  },

  dismiss: (id) => {
    const timer = dismissTimers.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      dismissTimers.delete(id);
    }
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
