import type { FC } from 'react';
import { Contact } from 'lucide-react';
import type { VCardBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { escapeAttr } from '@/core/compiler/compile';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

/**
 * vCard block — renders a "Save my contact" link / button whose
 * `href` is a `data:text/vcard;base64,…` URI built from the block's
 * fields. Clicking it in a modern email client downloads / opens
 * the contact in the recipient's address book.
 *
 * data: URIs in `href` are widely supported (Gmail, Apple Mail,
 * Outlook 365, Thunderbird). Old Outlook versions may strip them —
 * an admin can always also include a QR Code block whose payload
 * is the same vCard string for full coverage.
 */
const Renderer: FC<{ block: VCardBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
    textAlign: 'left',
  };

  const href = `data:text/vcard;charset=utf-8;base64,${btoa(unescape(encodeURIComponent(buildVCardString(block))))}`;
  const filename = `${(block.full_name || 'contact').replace(/\s+/g, '-').toLowerCase()}.vcf`;

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
              download={filename}
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
}> = ({ block, onChange }) => (
  <div className="flex flex-col gap-3 text-[12px]">
    <label className="flex flex-col gap-1.5">
      <span className="font-medium text-[var(--text-secondary)]">
        {__('Button label')}
      </span>
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
    <Field
      label={__('Title')}
      value={block.title}
      onChange={(v) => onChange({ title: v })}
    />
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

function compile(block: VCardBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` : '0';

  const vcardBase64 = btoa(unescape(encodeURIComponent(buildVCardString(block))));
  const href = `data:text/vcard;charset=utf-8;base64,${vcardBase64}`;
  const filename = `${(block.full_name || 'contact').replace(/\s+/g, '-').toLowerCase()}.vcf`;
  const label = escapeHtml(block.label || 'Save my contact');

  const styles = [
    'display:inline-block',
    'padding:8px 14px',
    // Colour values are interpolated into a CSS string. Strict
    // attribute-context escaping defends against a corrupted JSON
    // row containing `"` or `;` injection.
    `background:${escapeAttr(block.background_color)}`,
    `color:${escapeAttr(block.text_color)}`,
    `border-radius:${block.border_radius}px`,
    'text-decoration:none',
    'font-size:13px',
    'font-weight:500',
  ].join(';');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:${padding}"><a href="${href}" download="${escapeAttr(filename)}" style="${styles}">${label}</a></td></tr></table>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const definition: BlockDefinition<VCardBlock> = {
  type: 'vcard',
  label: 'vCard',
  description: 'Downloadable contact card (.vcf) link.',
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
