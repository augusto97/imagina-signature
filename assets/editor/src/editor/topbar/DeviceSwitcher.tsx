import type { FC } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { useDeviceStore } from '@/stores/deviceStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

const OPTIONS = [
  { value: 'desktop' as const, label: __('Desktop'), icon: Monitor },
  { value: 'mobile' as const, label: __('Mobile'), icon: Smartphone },
];

/**
 * 2-button device switcher for the canvas preview width. The active
 * value is stored in {@link useDeviceStore} so the canvas + preview
 * modal can read it directly.
 */
export const DeviceSwitcher: FC = () => {
  const device = useDeviceStore((s) => s.device);
  const setDevice = useDeviceStore((s) => s.setDevice);

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = device === value;
        return (
          <button
            key={value}
            type="button"
            title={label}
            onClick={() => setDevice(value)}
            className={cn(
              'inline-flex h-6 w-7 items-center justify-center rounded transition-colors',
              active
                ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]',
            )}
          >
            <Icon size={13} strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
};
