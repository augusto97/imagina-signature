import type { FC } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore, type ToastVariant } from '@/stores/toastStore';

const ICONS: Record<ToastVariant, FC<{ size: number }>> = {
  success: ({ size }) => <CheckCircle2 size={size} className="text-green-600" />,
  error: ({ size }) => <AlertCircle size={size} className="text-red-600" />,
  info: ({ size }) => <Info size={size} className="text-[var(--accent)]" />,
};

const BG: Record<ToastVariant, string> = {
  success: 'border-green-200 bg-green-50',
  error: 'border-red-200 bg-red-50',
  info: 'border-[var(--border-default)] bg-[var(--bg-panel)]',
};

/**
 * Renders the queue from {@link useToastStore} as stacked toasts in
 * the bottom-right. Framer Motion provides the entry / exit
 * animation; AnimatePresence keeps the exit visible after the
 * store removes the entry.
 */
export const Toaster: FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.variant];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`pointer-events-auto flex min-w-[240px] items-start gap-2 rounded border ${BG[toast.variant]} px-3 py-2 text-xs shadow-md`}
            >
              <Icon size={16} />
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                className="rounded p-0.5 text-[var(--text-muted)] hover:bg-black/5"
                onClick={() => dismiss(toast.id)}
              >
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
