import { useMemo, type FC, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import type { AvatarBlock } from '@/core/schema/blocks';
import type { SignatureSchema } from '@/core/schema/signature';
import { replaceVariables, systemVariables } from '@/core/compiler/variables';
import { ImageUploadButton } from '@/core/blocks/image/ImageUploadButton';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { TemplatePreviewFrame } from '@/editor/templates/TemplateGallery';
import { previewTemplateHtml } from '@/editor/templates/templatePreview';
import {
  detailPlaceholder,
  isPlaceholderImage,
  type DetailField,
} from '@/editor/templates/templateDetails';

interface DetailsFormProps {
  fields: DetailField[];
  /** Current values of the editable fields (signature variables). */
  values: Record<string, string>;
  /** Values a cleared field falls back to (the template's examples). */
  defaults?: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** Avatar that shows `{{photo_url}}` — sizes and masks the photo upload. */
  photoAvatar?: AvatarBlock | null;
  /** Hint under "Your details" (default: the onboarding's "prefilled with examples"). */
  ownHint?: string;
}

/**
 * The "Your details" form. Profile and brand-kit values are shown
 * read-only with where they come from; the signature's own fields are
 * editable (prefilled with the template's examples). A blank profile /
 * brand-kit field can be filled in for this signature only.
 */
export const DetailsForm: FC<DetailsFormProps> = ({
  fields,
  values,
  defaults = {},
  onChange,
  photoAvatar,
  ownHint,
}) => {
  const profile = fields.filter((f) => f.source === 'profile');
  const own = fields.filter((f) => f.source === 'signature');
  const company = fields.filter((f) => f.source === 'company');

  const row = (field: DetailField): ReactNode => (
    <DetailRow
      key={field.key}
      field={field}
      value={field.readOnly ? field.systemValue : (values[field.key] ?? '')}
      fallback={defaults[field.key] ?? ''}
      onChange={(value) => onChange(field.key, value)}
      photoAvatar={photoAvatar}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {profile.length > 0 && (
        <FieldGroup
          title={__('From your profile')}
          hint={__('Kept in sync with your WordPress profile.')}
        >
          {profile.map(row)}
        </FieldGroup>
      )}
      {own.length > 0 && (
        <FieldGroup
          title={__('Your details')}
          hint={ownHint ?? __('Prefilled with examples — replace them with yours.')}
        >
          {own.map(row)}
        </FieldGroup>
      )}
      {company.length > 0 && (
        <FieldGroup
          title={__('From your company')}
          hint={__('Set once for everyone in the brand kit.')}
        >
          {company.map(row)}
        </FieldGroup>
      )}
    </div>
  );
};

const FieldGroup: FC<{ title: string; hint: string; children: ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <section className="flex flex-col gap-2.5">
    <div>
      <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>
    </div>
    <div className="flex flex-col gap-2.5">{children}</div>
  </section>
);

interface DetailRowProps {
  field: DetailField;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  photoAvatar?: AvatarBlock | null;
}

const DetailRow: FC<DetailRowProps> = ({ field, value, fallback, onChange, photoAvatar }) => {
  const id = `imgsig-detail-${field.key}`;

  if (field.readOnly) {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-[11px] font-medium text-[var(--text-secondary)]">
          {field.label}
        </label>
        <div className="relative">
          <input
            id={id}
            type="text"
            value={value}
            readOnly
            aria-readonly
            className="!pr-8 !text-[var(--text-secondary)]"
          />
          <Lock
            size={12}
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
        </div>
      </div>
    );
  }

  if (field.input === 'photo') {
    return (
      <PhotoRow
        id={id}
        field={field}
        value={value}
        fallback={fallback}
        onChange={onChange}
        avatar={photoAvatar}
      />
    );
  }

  const blankSystem = field.source !== 'signature';
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-medium text-[var(--text-secondary)]">
        {field.label}
      </label>
      <input
        id={id}
        // `tel` fields use a text input (inputMode keeps the phone keypad)
        // so they share the editor's input styling.
        type={field.input === 'tel' ? 'text' : field.input}
        inputMode={field.input === 'tel' ? 'tel' : undefined}
        autoComplete="off"
        value={value}
        placeholder={detailPlaceholder(field.key)}
        onChange={(e) => onChange(e.target.value)}
      />
      {blankSystem && (
        <span className="text-[10.5px] text-[var(--text-muted)]">
          {field.source === 'profile'
            ? __('Not in your profile yet — saved with this signature only.')
            : __('Not in the brand kit yet — saved with this signature only.')}
        </span>
      )}
    </div>
  );
};

interface PhotoRowProps {
  id: string;
  field: DetailField;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  avatar?: AvatarBlock | null;
}

/**
 * Photo: a preview, an upload button (optimised, masked round when the
 * template's avatar is a circle) and a URL field. The template's
 * placeholder shows as an empty URL field; clearing the field brings
 * the placeholder back.
 */
const PhotoRow: FC<PhotoRowProps> = ({ id, field, value, fallback, onChange, avatar }) => {
  const placeholder = isPlaceholderImage(value);
  const resolved = useMemo(() => replaceVariables(value, systemVariables()).text, [value]);
  const shape = avatar?.shape ?? 'circle';
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-medium text-[var(--text-secondary)]">
        {field.label}
      </label>
      <div className="flex items-center gap-3">
        {/^https?:\/\//i.test(resolved) ? (
          <img
            src={resolved}
            alt=""
            width={44}
            height={44}
            className={cn(
              'h-11 w-11 shrink-0 border border-[var(--border-default)] object-cover',
              shape === 'circle' ? 'rounded-full' : 'rounded-lg',
            )}
          />
        ) : (
          <span aria-hidden className="h-11 w-11 shrink-0 rounded-full bg-[var(--bg-panel-soft)]" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <ImageUploadButton
              displayWidth={avatar?.size ?? 96}
              square
              circular={shape === 'circle'}
              filenameBase="photo"
              label={__('Upload photo')}
              onUploaded={(url) => onChange(url)}
            />
            {placeholder && (
              <span className="text-[10.5px] text-[var(--text-muted)]">
                {__('Using a placeholder photo')}
              </span>
            )}
          </div>
          <input
            id={id}
            type="url"
            value={placeholder ? '' : value}
            placeholder={__('…or paste an image URL')}
            onChange={(e) => onChange(e.target.value === '' ? fallback : e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

interface DetailsPreviewProps {
  schema: SignatureSchema;
  values: Record<string, string>;
  /** Visible box, in CSS px. */
  width: number;
  height: number;
}

/**
 * Live preview of `schema` with `values` — the real profile and brand
 * kit (no samples), QR / vCard as placeholders until they are uploaded.
 */
export const DetailsPreview: FC<DetailsPreviewProps> = ({ schema, values, width, height }) => {
  const html = useMemo(
    () => previewTemplateHtml(schema, values, { samples: false }),
    [schema, values],
  );
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-white shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-1.5 border-b border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-3 py-2">
        <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--border-strong)]" />
        <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--border-strong)]" />
        <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--border-strong)]" />
        <span className="ml-2 text-[11px] font-medium text-[var(--text-secondary)]">
          {__('Live preview')}
        </span>
      </div>
      <TemplatePreviewFrame
        html={html}
        width={schema.canvas?.width || 600}
        boxWidth={width}
        boxHeight={height}
        autoHeight
        minHeight={180}
        title={__('Signature preview')}
      />
    </div>
  );
};
