import { useEffect, useRef, useState, type FC } from 'react';
import { ImageOff, Trash2, Upload } from 'lucide-react';
import {
  LOGO_WIDTH_DEFAULT,
  LOGO_WIDTH_MAX,
  LOGO_WIDTH_MIN,
  type BrandKitCompany,
} from '@shared/brandKit';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { __ } from '@admin/i18n';
import {
  AdminUploadError,
  isUploadEnabled,
  UPLOADABLE_IMAGE_TYPES,
  uploadImage,
} from '@admin/services/uploads';
import { Field, Section } from '../_shared';

/** `{{key}}` — the token a field is available as in signatures. */
const token = (key: string): string => `{{${key}}}`;

interface Props {
  company: BrandKitCompany;
  onChange: (patch: Partial<BrandKitCompany>) => void;
  onUploadError: (message: string) => void;
}

/**
 * Brand kit → Company: the details every signature can pull in as
 * read-only `{{company_*}}` variables, plus the company logo.
 */
export const CompanySection: FC<Props> = ({ company, onChange, onUploadError }) => (
  <Section
    title={__('Company')}
    description={__(
      'Shared by every signature as read-only variables such as {{company_name}} and {{company_website}}. Leave a field empty to hide it.',
    )}
  >
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={__('Company name')} hint={token('company_name')}>
        <input
          type="text"
          value={company.name}
          maxLength={120}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <Field label={__('Tagline')} hint={token('company_tagline')}>
        <input
          type="text"
          value={company.tagline}
          maxLength={160}
          onChange={(e) => onChange({ tagline: e.target.value })}
        />
      </Field>
      <Field label={__('Website')} hint={token('company_website')}>
        <input
          type="url"
          value={company.website}
          placeholder="https://"
          onChange={(e) => onChange({ website: e.target.value })}
        />
      </Field>
      <Field label={__('Phone')} hint={token('company_phone')}>
        <input
          type="text"
          inputMode="tel"
          autoComplete="tel"
          value={company.phone}
          maxLength={40}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </Field>
      <Field label={__('Email')} hint={token('company_email')}>
        <input
          type="email"
          value={company.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </Field>
      <Field label={__('Address')} hint={token('company_address')}>
        <input
          type="text"
          value={company.address}
          maxLength={300}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </Field>
    </div>

    <LogoField company={company} onChange={onChange} onUploadError={onUploadError} />
  </Section>
);

/**
 * Logo URL + display width, with a live preview and (unless the site is
 * in URL-only storage mode) an Upload button that stores the file
 * through the plugin's `/upload/*` flow.
 */
const LogoField: FC<Props> = ({ company, onChange, onUploadError }) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [broken, setBroken] = useState(false);
  const [widthDraft, setWidthDraft] = useState(String(company.logo_width));
  const canUpload = isUploadEnabled();

  useEffect(() => setBroken(false), [company.logo_url]);
  useEffect(() => setWidthDraft(String(company.logo_width)), [company.logo_width]);

  const commitWidth = (): void => {
    const n = Math.round(Number(widthDraft));
    const width =
      Number.isFinite(n) && widthDraft.trim() !== ''
        ? Math.max(LOGO_WIDTH_MIN, Math.min(LOGO_WIDTH_MAX, n))
        : LOGO_WIDTH_DEFAULT;
    setWidthDraft(String(width));
    if (width !== company.logo_width) onChange({ logo_width: width });
  };

  const onPick = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadImage(file, file.name.replace(/\.[^.]+$/, '') || 'logo');
      onChange({ logo_url: asset.url });
    } catch (e) {
      onUploadError(e instanceof AdminUploadError ? e.message : __('Upload failed.'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="grid gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_200px]">
      <div className="space-y-3">
        <Field
          label={__('Logo URL')}
          hint={__('%s — PNG or JPG work best in email.', token('company_logo'))}
        >
          <input
            type="url"
            value={company.logo_url}
            placeholder="https://"
            onChange={(e) => onChange({ logo_url: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={__('Logo width (px)')}>
            <input
              type="number"
              min={LOGO_WIDTH_MIN}
              max={LOGO_WIDTH_MAX}
              value={widthDraft}
              onChange={(e) => {
                setWidthDraft(e.target.value);
                // Live preview for in-range values; blur clamps the rest.
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= LOGO_WIDTH_MIN && n <= LOGO_WIDTH_MAX) {
                  onChange({ logo_width: n });
                }
              }}
              onBlur={commitWidth}
              className="!w-28"
            />
          </Field>
          {canUpload && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={UPLOADABLE_IMAGE_TYPES.join(',')}
                className="hidden"
                onChange={(e) => void onPick(e.target.files?.[0])}
              />
              <Button
                size="sm"
                variant="secondary"
                icon={uploading ? <Spinner size={12} /> : <Upload size={13} />}
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? __('Uploading…') : __('Upload logo')}
              </Button>
            </>
          )}
          {company.logo_url && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={13} />}
              onClick={() => onChange({ logo_url: '' })}
            >
              {__('Remove')}
            </Button>
          )}
        </div>
      </div>

      <div
        className="flex min-h-[96px] items-center justify-center overflow-hidden rounded-md border border-dashed border-[var(--border-default)] bg-white p-2"
        aria-label={__('Logo preview')}
      >
        {company.logo_url && !broken ? (
          <img
            src={company.logo_url}
            alt={company.name || __('Company logo')}
            width={company.logo_width}
            onError={() => setBroken(true)}
            style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-center text-[11px] text-[var(--text-muted)]">
            <ImageOff size={18} />
            {company.logo_url ? __('This image could not be loaded.') : __('No logo yet')}
          </span>
        )}
      </div>
    </div>
  );
};
