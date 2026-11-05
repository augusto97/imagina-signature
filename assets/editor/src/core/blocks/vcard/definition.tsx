import type { FC } from 'react';
import { Contact } from 'lucide-react';
import type { VCardBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { attr, escapeHtml, paddingCss, px, safeColor } from '@/core/compiler/css';
import { contentHash } from '@/core/compiler/hash';
import { markerAttr, report } from '@/core/compiler/issues';
import { isUploadEnabled } from '@/bridge/apiClient';
import { slugFilename, uploadBlob } from '@/services/uploads';
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
const Renderer: FC<{ block: VCardBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
    textAlign: 'left',
  };

  // Canvas links never navigate (Canvas intercepts clicks); the hosted
  // file URL is shown when available.
  const href = block.vcf_url || '#';

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse' }}
    >
      <tbody>
        <tr>
          <td style={td}>
            <a
              href={href}
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                background: block.background_color,
                color: block.text_color,
                borderRadius: `${block.border_radius}px`,
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {block.label || __('Save my contact')}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
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

      <ColorInput
        label={__('Background')}
        value={block.background_color}
        onChange={(v) => onChange({ background_color: v })}
      />
      <ColorInput
        label={__('Text colour')}
        value={block.text_color}
        onChange={(v) => onChange({ text_color: v })}
      />
      <DimensionInput
        label={__('Border radius (px)')}
        value={block.border_radius}
        onChange={(v) => onChange({ border_radius: v })}
        min={0}
        max={32}
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

  const padding = paddingCss(block.padding);
  const label = escapeHtml(block.label || __('Save my contact'));

  const styles = [
    'display:inline-block',
    'padding:8px 14px',
    // Colour values are free-form schema strings — validate them
    // through the central serializer instead of escaping.
    `background:${safeColor(block.background_color, '#2563eb')}`,
    `color:${safeColor(block.text_color, '#ffffff')}`,
    `border-radius:${px(block.border_radius, 0, 999)}px`,
    'text-decoration:none',
    'font-size:13px',
    'font-weight:500',
  ].join(';');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:${padding}"><a${markerAttr(block)} href="${attr(block.vcf_url)}" style="${styles}">${label}</a></td></tr></table>`;
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
    label: 'Save my contact',
    full_name: '',
    organization: '',
    title: '',
    email: '',
    phone: '',
    website: '',
    background_color: '#2563eb',
    text_color: '#ffffff',
    border_radius: 6,
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);

export { definition as vCardDefinition };
