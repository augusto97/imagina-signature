import type { FC } from 'react';
import { AlignCenter, AlignLeft, AlignRight, type LucideIcon } from 'lucide-react';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

type Align = 'left' | 'center' | 'right';

interface Props {
  label?: string;
  value: Align;
  onChange: (value: Align) => void;
}

/**
 * Left / centre / right segmented control for image-like blocks
 * (horizontal position in the space available).
 */
export const ImageAlignInput: FC<Props> = ({ label, value, onChange }) => {
  const options: Array<{ value: Align; label: string; icon: LucideIcon }> = [
    { value: 'left', label: __('Align left'), icon: AlignLeft },
    { value: 'center', label: __('Align center'), icon: AlignCenter },
    { value: 'right', label: __('Align right'), icon: AlignRight },
  ];
  const groupLabel = label ?? __('Alignment');

  return (
    <div>
      <span className="is-section-label mb-1 block">{groupLabel}</span>
      <div
        role="radiogroup"
        aria-label={groupLabel}
        className="inline-flex rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-0.5"
      >
        {options.map((option) => {
          const Icon = option.icon;
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option.label}
              title={option.label}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex h-6 w-8 items-center justify-center rounded transition-colors',
                active
                  ? 'bg-[var(--bg-panel)] text-[var(--accent)] shadow-[var(--shadow-sm)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon size={13} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
