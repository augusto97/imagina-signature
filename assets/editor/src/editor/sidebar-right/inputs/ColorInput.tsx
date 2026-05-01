import type { FC } from 'react';
import { getConfig } from '@/bridge/apiClient';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { Field } from './_shared';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Native HTML colour picker + hex text input pair. The native
 * control is fast everywhere; the text input lets the user paste a
 * hex code or a CSS named colour.
 *
 * If the site admin configured a brand palette
 * (`IMGSIG_EDITOR_CONFIG.brandPalette`), the swatches render as a
 * row of small clickable circles below the picker — single-click to
 * apply, no typing required.
 */
export const ColorInput: FC<Props> = ({ label, value, onChange }) => {
  let palette: string[] = [];
  try {
    palette = getConfig().brandPalette ?? [];
  } catch {
    // Bootstrap unavailable (preview / tests). Swatches simply omitted.
  }

  return (
    <Field label={label}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            className="!h-7 !w-9 shrink-0 !p-0.5"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            className="flex-1 font-mono"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {palette.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" aria-label={__('Brand palette')}>
            {palette.map((swatch) => {
              const active = swatch.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={swatch}
                  type="button"
                  title={swatch}
                  onClick={() => onChange(swatch)}
                  className={cn(
                    'h-4 w-4 shrink-0 rounded-full ring-1 ring-inset transition-transform hover:scale-110',
                    active
                      ? 'ring-[var(--accent)] ring-offset-1'
                      : 'ring-[var(--border-strong)]',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              );
            })}
          </div>
        )}
      </div>
    </Field>
  );
};
