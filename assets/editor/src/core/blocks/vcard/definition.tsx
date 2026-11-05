import { useMemo, type FC } from 'react';
import { Contact } from 'lucide-react';
import type { VCardBlock } from '@/core/schema/blocks';
import type { CanvasConfig } from '@/core/schema/signature';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { AlignInput } from '@/editor/sidebar-right/inputs/AlignInput';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { SegmentedInput } from '@/editor/sidebar-right/inputs/SegmentedInput';
import { contentHash } from '@/core/compiler/hash';
import { report } from '@/core/compiler/issues';
import { isUploadEnabled } from '@/bridge/apiClient';
import { slugFilename, uploadBlob } from '@/services/uploads';
import { useSchemaStore } from '@/stores/schemaStore';
import { ButtonPreview } from '../button-cta/ButtonPreview';
import {
  BUTTON_DEFAULTS,
  compileButton,
  readableTextColor,
  resolveButtonSpec,
  type ButtonDefaults,
  type ButtonSpec,
} from '../button-cta/buttonMarkup';
import { BUTTON_TYPOGRAPHY } from '../text/typography';
import { HostedAssetStatus, useHostedAssetSync } from '../qr-code/definition';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

/**
 * vCard block — a "Save my contact" link to a hosted `.vcf` file.
 *
 * The link used to be a `data:text/vcard;base64,…` URI, which Gmail /
 * Outlook.com strip and which counts against Gmail's 10,000-character
 * signature limit. The editor now uploads the generated vCard as
 * `text/vcard` (`<name>.vcf`) through `/upload/*` whenever the fields
 * change (debounced), stores its public URL in `vcf_url` (+ the content
 * hash in `vcf_hash`), and the compiler emits a normal https link.
 */

/** Hash of the vCard text the hosted file must contain. */
export function vcardContentHash(block: VCardBlock): string {
  return contentHash(`vcf-v1|${buildVCardString(block)}`);
}

/** True when the block carries at least one contact detail. */
export function vcardHasDetails(block: VCardBlock): boolean {
  return [
    block.full_name,
    block.organization,
    block.title,
    block.email,
    block.phone,
    block.website,
  ].some((v) => typeof v === 'string' && v.trim() !== '');
}

export function vcardFilename(block: VCardBlock): string {
  return `${slugFilename(block.full_name || block.organization || '', 'contact')}.vcf`;
}

/** Generates the .vcf, uploads it and resolves to the block fields to store. */
export async function uploadVCardFile(
  block: VCardBlock,
): Promise<Pick<VCardBlock, 'vcf_url' | 'vcf_hash'>> {
  const blob = new Blob([buildVCardString(block)], { type: 'text/vcard' });
  const asset = await uploadBlob(blob, vcardFilename(block));
  return { vcf_url: asset.url, vcf_hash: vcardContentHash(block) };
}

/** vCard link look: a compact 13px / medium button (8 × 14 px padding). */
const VCARD_BUTTON: ButtonDefaults = {
  ...BUTTON_DEFAULTS,
  paddingX: 14,
  paddingY: 8,
  fill: '#2563eb',
  typography: { ...BUTTON_TYPOGRAPHY, sizeScale: 13 / 14, fallbackSize: 13, fontWeight: 500 },
};

/**
 * The vCard link as a button spec (shared button styling): `link_style`
 * 'text' renders a plain text link, anything else a solid button.
 */
export function vcardButtonSpec(
  block: VCardBlock,
  canvas: Partial<CanvasConfig> | null | undefined,
): ButtonSpec {
  return resolveButtonSpec(
    {
      label: block.label || __('Save my contact'),
      href: block.vcf_url ?? '',
      preset: block.link_style === 'text' ? 'text' : 'solid',
      background_color: block.background_color,
      text_color: block.text_color,
      border_radius: block.border_radius,
      align: block.align,
      padding: block.padding,
    },
    canvas,
    VCARD_BUTTON,
  );
}

const Renderer: FC<{ block: VCardBlock }> = ({ block }) => {
  const canvas = useSchemaStore((s) => s.schema.canvas);
  const spec = useMemo(() => vcardButtonSpec(block, canvas), [block, canvas]);
  // Canvas links never navigate (Canvas intercepts clicks); the hosted
  // file URL is shown when available.
  return <ButtonPreview spec={spec} href={block.vcf_url || '#'} />;
};

const Properties: FC<{
  block: VCardBlock;
  onChange: (updates: Partial<VCardBlock>) => void;
}> = ({ block, onChange }) => {
  const hash = vcardContentHash(block);
  const upToDate = Boolean(block.vcf_url) && block.vcf_hash === hash;
  const sync = useHostedAssetSync({
    blockId: block.id,
    hash,
    upToDate,
    canSync: vcardHasDetails(block),
    upload: () => uploadVCardFile(block),
    hashOf: (latest) => (latest.type === 'vcard' ? vcardContentHash(latest) : null),
  });
  const isText = block.link_style === 'text';

  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <HostedAssetStatus
        status={sync.status}
        error={sync.error}
        hosted={upToDate}
        onRetry={sync.retry}
        disabledMessage={__(
          'Uploads are disabled on this site, so the contact card cannot be hosted and the link will not appear in the exported signature.',
        )}
      />
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-[var(--text-secondary)]">{__('Button label')}</span>
        <input
          type="text"
          value={block.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={__('Save my contact')}
        />
      </label>

      <span className="is-section-label">{__('Contact details')}</span>

      <Field
        label={__('Full name')}
        value={block.full_name}
        onChange={(v) => onChange({ full_name: v })}
      />
      <Field
        label={__('Organization')}
        value={block.organization}
        onChange={(v) => onChange({ organization: v })}
      />
      <Field label={__('Title')} value={block.title} onChange={(v) => onChange({ title: v })} />
      <Field
        label={__('Email')}
        type="email"
        value={block.email}
        onChange={(v) => onChange({ email: v })}
      />
      <Field
        label={__('Phone')}
        type="tel"
        value={block.phone}
        onChange={(v) => onChange({ phone: v })}
      />
      <Field
        label={__('Website')}
        type="url"
        value={block.website}
        onChange={(v) => onChange({ website: v })}
      />

      <span className="is-section-label">{__('Style')}</span>

      <SegmentedInput<'button' | 'text'>
        label={__('Show as')}
        value={isText ? 'text' : 'button'}
        onChange={(v) => {
          const textColor = readableTextColor(block, v === 'button');
          onChange(textColor ? { link_style: v, text_color: textColor } : { link_style: v });
        }}
        options={[
          { value: 'button', label: __('Button') },
          { value: 'text', label: __('Text link') },
        ]}
      />
      {!isText && (
        <ColorInput
          label={__('Background')}
          value={block.background_color}
          onChange={(v) => onChange({ background_color: v })}
        />
      )}
      <ColorInput
        label={__('Text colour')}
        value={block.text_color}
        onChange={(v) => onChange({ text_color: v })}
      />
      {!isText && (
        <DimensionInput
          label={__('Border radius (px)')}
          value={block.border_radius}
          onChange={(v) => onChange({ border_radius: v })}
          min={0}
          max={32}
        />
      )}
      <AlignInput value={block.align} onChange={(v) => onChange({ align: v })} />
      <PaddingInput
        value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }}
        onChange={(p) => onChange({ padding: p })}
      />
    </div>
  );
};

const Field: FC<{
  label: string;
  value: string;
  type?: string;
  onChange: (v: string) => void;
}> = ({ label, value, type = 'text', onChange }) => (
  <label className="flex flex-col gap-1.5">
    <span className="font-medium text-[var(--text-secondary)]">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
  </label>
);

/**
 * Build a strict-3.0 vCard string from the block's fields. Empty
 * fields are omitted. Lines use CRLF as RFC 6350 requires.
 */
export function buildVCardString(block: VCardBlock): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');
  if (block.full_name) {
    lines.push(`FN:${escapeVCard(block.full_name)}`);
    // N (structured name) — best-effort split on the last space.
    const parts = block.full_name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : block.full_name;
    lines.push(`N:${escapeVCard(last)};${escapeVCard(first)};;;`);
  }
  if (block.organization) lines.push(`ORG:${escapeVCard(block.organization)}`);
  if (block.title) lines.push(`TITLE:${escapeVCard(block.title)}`);
  if (block.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(block.email)}`);
  if (block.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(block.phone)}`);
  if (block.website) lines.push(`URL:${escapeVCard(block.website)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function escapeVCard(value: string): string {
  // RFC 6350 §3.4: backslash, comma, semicolon, newline are special.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

function compile(block: VCardBlock, ctx: CompileContext): string {
  if (!vcardHasDetails(block)) {
    report(
      ctx,
      'warning',
      __('vCard block has no contact details yet, so it was left out of the export.'),
      block,
      'vcard-empty',
    );
    return '';
  }
  if (!block.vcf_url) {
    report(
      ctx,
      'error',
      isUploadEnabled()
        ? __(
            'vCard file not uploaded yet. Select the vCard block (or use “Fix embedded images”) to upload it.',
          )
        : __(
            'vCards need a hosted .vcf file, but uploads are disabled on this site, so the link was left out.',
          ),
      block,
      'vcard-not-uploaded',
    );
    return '';
  }
  if (block.vcf_hash !== vcardContentHash(block)) {
    report(
      ctx,
      'warning',
      __(
        'The hosted vCard file is out of date with the block’s contact details; it is being re-uploaded.',
      ),
      block,
      'vcard-stale',
    );
  }

  // Shared bullet-proof button (VML for Outlook) or a plain text link;
  // every value is validated by the button helper / css.ts.
  return compileButton(vcardButtonSpec(block, ctx.canvas), block, ctx);
}

const definition: BlockDefinition<VCardBlock> = {
  type: 'vcard',
  label: 'vCard',
  description: 'Link to a hosted contact card (.vcf).',
  icon: Contact,
  category: 'content',
  create: (): VCardBlock => ({
    id: generateId('vcard'),
    type: 'vcard',
    label: __('Save my contact'),
    full_name: '',
    organization: '',
    title: '',
    email: '',
    phone: '',
    website: '',
    background_color: '#2563eb',
    text_color: '#ffffff',
    border_radius: 6,
    link_style: 'button',
    align: 'left',
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);

export { definition as vCardDefinition };
