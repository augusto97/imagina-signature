import type { FC } from 'react';
import { Braces, UserRound } from 'lucide-react';
import { useCanvasDataStore } from '@/stores/canvasDataStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

/**
 * "Show data / Show fields" switch for the canvas. Data (default)
 * renders `{{variables}}` with their values — the user's profile, the
 * company brand kit and the signature's own variables — exactly as the
 * export will; Fields shows the raw tokens. Editing always happens in
 * the sidebar with the tokens. Remembered per user (see
 * {@link useCanvasDataStore}).
 */
export const CanvasDataToggle: FC = () => {
  const showData = useCanvasDataStore((s) => s.showData);
  const setShowData = useCanvasDataStore((s) => s.setShowData);

  const options = [
    { value: true, label: __('Show data'), short: __('Data'), icon: UserRound },
    { value: false, label: __('Show fields'), short: __('Fields'), icon: Braces },
  ];

  return (
    <div
      role="group"
      aria-label={__('Canvas content')}
      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-0.5"
    >
      {options.map(({ value, label, short, icon: Icon }) => {
        const active = showData === value;
        return (
          <button
            key={short}
            type="button"
            title={label}
            aria-pressed={active}
            onClick={() => setShowData(value)}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium transition-colors',
              active
                ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]',
            )}
          >
            <Icon size={13} strokeWidth={1.8} />
            {short}
          </button>
        );
      })}
    </div>
  );
};
