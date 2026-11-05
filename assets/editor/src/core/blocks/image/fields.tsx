import type { FC, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { __ } from '@/i18n/helpers';

/**
 * Small form fields shared by the Image, Avatar and Banner inspectors.
 */

export const FieldHint: FC<{ children: ReactNode; tone?: 'muted' | 'warning' }> = ({
  children,
  tone = 'muted',
}) => (
  <p
    className={
      tone === 'warning'
        ? 'flex items-start gap-1.5 text-[10.5px] leading-snug text-amber-700'
        : 'text-[10.5px] leading-snug text-[var(--text-muted)]'
    }
  >
    {tone === 'warning' && <AlertTriangle size={11} className="mt-px shrink-0" />}
    <span>{children}</span>
  </p>
);

/** Alt text — required: warns inline while empty. */
export const AltTextField: FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const missing = value.trim() === '';
  return (
    <label className="flex flex-col gap-1">
      <span className="is-section-label">{__('Alt text')}</span>
      <input
        type="text"
        value={value}
        aria-invalid={missing}
        placeholder={placeholder ?? __('Describe the image')}
        onChange={(e) => onChange(e.target.value)}
        className={missing ? '!border-amber-300' : undefined}
      />
      {missing ? (
        <FieldHint tone="warning">
          {__('Required: shown when images are blocked and read aloud by screen readers.')}
        </FieldHint>
      ) : null}
    </label>
  );
};

/** Optional click-through URL. */
export const LinkField: FC<{
  value: string;
  onChange: (value: string) => void;
  label?: string;
}> = ({ value, onChange, label }) => (
  <label className="flex flex-col gap-1">
    <span className="is-section-label">{label ?? __('Link (optional)')}</span>
    <input
      type="url"
      value={value}
      placeholder="https://"
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);

/** Outlook 2007–2019 static replacement for an animated GIF. */
export const StaticFallbackField: FC<{ value: string; onChange: (value: string) => void }> = ({
  value,
  onChange,
}) => (
  <label className="flex flex-col gap-1">
    <span className="is-section-label">{__('Static fallback URL')}</span>
    <input
      type="url"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="https://example.com/banner-static.png"
    />
    <FieldHint>
      {__(
        'Outlook 2007–2019 freezes GIFs on the first frame. Provide a static PNG/JPG and modern clients keep the animation while old Outlook shows this instead.',
      )}
    </FieldHint>
  </label>
);
