import type { FC } from 'react';
import {
  ICON_SHAPES,
  ICON_TONES,
  iconUrl,
  type IconShape,
  type IconTone,
} from '@/core/compiler/assets';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { shapeLabel, toneLabel } from './iconSet';

interface Props {
  shape: IconShape;
  tone: IconTone;
  /** Icon shown in the previews (e.g. the block's first network). */
  previewIcon: string;
  onChange: (patch: { shape?: IconShape; tone?: IconTone }) => void;
}

/**
 * Shape + colour chooser for the hosted icon set, previewing the real
 * PNGs. Shared by the Social icons and Contact blocks.
 */
export const IconStylePicker: FC<Props> = ({ shape, tone, previewIcon, onChange }) => (
  <div className="space-y-3">
    <div>
      <span className="is-section-label mb-1 block">{__('Shape')}</span>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={__('Shape')}>
        {ICON_SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={shape === s}
            title={shapeLabel(s)}
            onClick={() => onChange({ shape: s })}
            className={cn(
              'flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[10px] transition-colors',
              shape === s
                ? 'border-[var(--border-selected)] bg-[var(--bg-selected)] text-[var(--text-primary)]'
                : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            <img
              src={iconUrl(previewIcon, s, tone === 'light' ? 'dark' : tone)}
              width={22}
              height={22}
              alt=""
              draggable={false}
            />
            <span className="leading-none">{shapeLabel(s)}</span>
          </button>
        ))}
      </div>
    </div>
    <div>
      <span className="is-section-label mb-1 block">{__('Color')}</span>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={__('Color')}>
        {ICON_TONES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tone === t}
            title={toneLabel(t)}
            aria-label={toneLabel(t)}
            onClick={() => onChange({ tone: t })}
            className={cn(
              'flex h-9 items-center justify-center rounded-md border transition-colors',
              t === 'light' ? 'bg-[#1f2937]' : '',
              tone === t
                ? 'border-[var(--border-selected)] ring-1 ring-[var(--border-selected)]'
                : 'border-[var(--border-default)] hover:border-[var(--border-strong)]',
            )}
          >
            <img
              src={iconUrl(previewIcon, shape, t)}
              width={22}
              height={22}
              alt=""
              draggable={false}
            />
          </button>
        ))}
      </div>
      <span className="mt-1 block text-[10px] leading-tight text-[var(--text-muted)]">
        {toneLabel(tone)}
      </span>
    </div>
  </div>
);
