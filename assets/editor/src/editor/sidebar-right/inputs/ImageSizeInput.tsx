import type { FC } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';

/** CSS unit suffix (not translated). */
const PX = 'px';

export interface ImageSizePatch {
  width?: number;
  height?: number;
  lock_aspect?: boolean;
}

interface Props {
  width: number | undefined;
  height: number | undefined;
  lock: boolean;
  /** Height / width of the image (intrinsic when known), null when unknown. */
  ratio: number | null;
  onChange: (patch: ImageSizePatch) => void;
  minWidth?: number;
  maxWidth?: number;
}

/**
 * Width + optional height with an aspect-lock toggle.
 *
 * Locked (default): editing one side updates the other from `ratio`;
 * the height field shows the derived value. Unlocked: the height is
 * free (empty = automatic). Writes always include every field that
 * changed, so one edit is one undo step.
 */
export const ImageSizeInput: FC<Props> = ({
  width,
  height,
  lock,
  ratio,
  onChange,
  minWidth = 1,
  maxWidth = 1200,
}) => {
  const derivedHeight = lock && ratio && width ? Math.max(1, Math.round(width * ratio)) : undefined;
  const shownHeight = derivedHeight ?? height;

  const setWidth = (raw: string): void => {
    if (raw === '') {
      onChange({ width: undefined, ...(lock ? { height: undefined } : {}) });
      return;
    }
    const w = clamp(Number(raw), minWidth, maxWidth);
    if (lock && ratio) onChange({ width: w, height: Math.max(1, Math.round(w * ratio)) });
    else onChange({ width: w });
  };

  const setHeight = (raw: string): void => {
    if (raw === '') {
      onChange({ height: undefined });
      return;
    }
    const h = clamp(Number(raw), 1, 4000);
    if (lock && ratio) onChange({ height: h, width: clamp(Math.round(h / ratio), minWidth, maxWidth) });
    else onChange({ height: h });
  };

  const toggleLock = (): void => {
    const next = !lock;
    if (next && ratio && width) onChange({ lock_aspect: true, height: Math.max(1, Math.round(width * ratio)) });
    else onChange({ lock_aspect: next });
  };

  return (
    <div>
      <span className="is-section-label mb-1 block">{__('Size')}</span>
      <div className="flex items-center gap-1.5">
        <SizeField
          label="W"
          ariaLabel={__('Width (px)')}
          value={width}
          placeholder={__('Auto')}
          onChange={setWidth}
        />
        <button
          type="button"
          onClick={toggleLock}
          aria-pressed={lock}
          title={lock ? __('Unlock aspect ratio') : __('Lock aspect ratio')}
          aria-label={lock ? __('Unlock aspect ratio') : __('Lock aspect ratio')}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors',
            lock
              ? 'border-[var(--accent-soft)] bg-[var(--bg-selected)] text-[var(--accent)]'
              : 'border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
          )}
        >
          {lock ? <Lock size={12} /> : <LockOpen size={12} />}
        </button>
        <SizeField
          label="H"
          ariaLabel={__('Height (px)')}
          value={shownHeight}
          placeholder={__('Auto')}
          onChange={setHeight}
        />
      </div>
    </div>
  );
};

const SizeField: FC<{
  label: string;
  ariaLabel: string;
  value: number | undefined;
  placeholder: string;
  onChange: (raw: string) => void;
}> = ({ label, ariaLabel, value, placeholder, onChange }) => (
  <label className="relative flex min-w-0 flex-1 items-center">
    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {label}
    </span>
    <input
      type="number"
      min={1}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className="w-full pl-6 pr-6 text-right"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
      {PX}
    </span>
  </label>
);

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.min(max, Math.max(min, n)));
}
