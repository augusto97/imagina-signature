import { useEffect, useState, type FC } from 'react';
import {
  BRAND_KIT_FONTS,
  isBrandKitColor,
  type BrandKitCompany,
  type BrandKitTypography,
} from '@shared/brandKit';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { Field, Section } from '../_shared';

interface Props {
  typography: BrandKitTypography;
  company: BrandKitCompany;
  /** Brand palette swatches offered as quick picks. */
  palette: string[];
  onChange: (patch: Partial<BrandKitTypography>) => void;
}

/**
 * Brand kit → Typography & colours: the font and colours every NEW
 * signature starts from (existing signatures keep their own), with a
 * live sample line rendered in them.
 */
export const TypographySection: FC<Props> = ({ typography, company, palette, onChange }) => (
  <Section
    title={__('Typography & colours')}
    description={__(
      'New signatures start with this font and these colours. Existing signatures are not changed.',
    )}
  >
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={__('Font')}>
        <select
          value={typography.font_family}
          onChange={(e) => onChange({ font_family: e.target.value })}
        >
          {BRAND_KIT_FONTS.map((font) => (
            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
              {font.label}
            </option>
          ))}
        </select>
      </Field>
      <ColorField
        label={__('Text colour')}
        value={typography.text_color}
        palette={palette}
        onChange={(v) => onChange({ text_color: v })}
      />
      <ColorField
        label={__('Link colour')}
        value={typography.link_color}
        palette={palette}
        onChange={(v) => onChange({ link_color: v })}
      />
      <ColorField
        label={__('Accent colour')}
        value={typography.accent_color}
        palette={palette}
        onChange={(v) => onChange({ accent_color: v })}
      />
    </div>

    <SampleLine typography={typography} company={company} />
  </Section>
);

/** Expands `#rgb` to `#rrggbb` (what `<input type="color">` requires). */
function toSixDigitHex(hex: string): string {
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`.toLowerCase();
  }
  return hex.toLowerCase();
}

const ColorField: FC<{
  label: string;
  value: string;
  palette: string[];
  onChange: (value: string) => void;
}> = ({ label, value, palette, onChange }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const swatches = palette.filter(isBrandKitColor).slice(0, 8);

  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <span
          className="relative inline-flex h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-inset ring-black/10"
          style={{ backgroundColor: isBrandKitColor(value) ? value : '#ffffff' }}
        >
          <input
            type="color"
            value={isBrandKitColor(value) ? toSixDigitHex(value) : '#000000'}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </span>
        <input
          type="text"
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.trim();
            setDraft(next);
            if (isBrandKitColor(next)) onChange(next.toLowerCase());
          }}
          onBlur={() => setDraft(value)}
          className={cn(
            'font-mono uppercase',
            !isBrandKitColor(draft) && '!border-[var(--danger)]',
          )}
        />
      </div>
      {swatches.length > 0 && (
        <span className="mt-1.5 flex flex-wrap gap-1">
          {swatches.map((swatch) => (
            <button
              key={swatch}
              type="button"
              title={swatch}
              onClick={() => onChange(swatch.toLowerCase())}
              className={cn(
                'h-4 w-4 rounded ring-1 ring-inset ring-black/10',
                swatch.toLowerCase() === value.toLowerCase() &&
                  'ring-2 ring-[var(--accent)] ring-offset-1',
              )}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </span>
      )}
    </Field>
  );
};

const EXAMPLE_WEBSITE = 'www.example.com';

/** Live preview of the kit: company line, tagline and a link, in the kit's font and colours. */
const SampleLine: FC<{ typography: BrandKitTypography; company: BrandKitCompany }> = ({
  typography,
  company,
}) => {
  const website = company.website.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return (
    <div className="space-y-1">
      <span className="is-section-label">{__('Sample')}</span>
      <div
        className="rounded-md border border-[var(--border-default)] bg-white px-4 py-3"
        style={{
          fontFamily: typography.font_family,
          color: typography.text_color,
          fontSize: 14,
          lineHeight: 1.5,
          borderLeft: `3px solid ${typography.accent_color}`,
        }}
      >
        <div style={{ fontWeight: 700, color: typography.accent_color }}>
          {company.name || __('Your company')}
        </div>
        <div>{company.tagline || __('Your tagline goes here')}</div>
        <div>
          <a
            href={company.website || '#'}
            onClick={(e) => e.preventDefault()}
            style={{ color: typography.link_color, textDecoration: 'underline' }}
          >
            {website || EXAMPLE_WEBSITE}
          </a>
          {company.phone && <span> · {company.phone}</span>}
        </div>
      </div>
    </div>
  );
};
