import type { FC } from 'react';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

type Align = 'left' | 'center' | 'right';

interface Props {
  value: Align;
  onChange: (value: Align) => void;
}

const OPTIONS: Array<{ value: Align; icon: typeof AlignLeft; label: () => string }> = [
  { value: 'left', icon: AlignLeft, label: () => __('Align left') },
  { value: 'center', icon: AlignCenter, label: () => __('Align center') },
  { value: 'right', icon: AlignRight, label: () => __('Align right') },
];

/** Left / center / right segmented control (Social icons, Contact). */
export const AlignButtons: FC<Props> = ({ value, onChange }) => (
  <div>
    <span className="is-section-label mb-1 block">{__('Alignment')}</span>
    <div
      className="inline-flex rounded-md border border-[var(--border-default)] p-0.5"
      role="radiogroup"
      aria-label={__('Alignment')}
    >
      {OPTIONS.map(({ value: v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={label()}
          title={label()}
          onClick={() => onChange(v)}
          className={cn(
            'flex h-7 w-8 items-center justify-center rounded transition-colors',
            value === v
              ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
          )}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  </div>
);
