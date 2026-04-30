import type { FC } from 'react';
import { Mail, Phone, Globe, Contact } from 'lucide-react';
import type { ContactRowBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

type RowIcon = 'email' | 'phone' | 'web';

const ICONS: Record<RowIcon, FC<{ size: number; color: string }>> = {
  email: ({ size, color }) => <Mail size={size} color={color} />,
  phone: ({ size, color }) => <Phone size={size} color={color} />,
  web: ({ size, color }) => <Globe size={size} color={color} />,
};

const Renderer: FC<{ block: ContactRowBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` : '0',
    fontFamily: block.style.font_family,
    fontSize: `${block.style.font_size}px`,
    color: block.style.color,
  };

  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        {block.rows.map((row, i) => {
          const Icon = ICONS[row.icon];
          return (
            <tr key={`${row.icon}-${i}`}>
              <td style={td}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon size={Math.round(block.style.font_size * 1.1)} color={block.style.color} />
                  <a href={row.href} style={{ color: block.style.color, textDecoration: 'none' }}>
                    {row.label}
                  </a>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const Properties: FC<{ block: ContactRowBlock; onChange: (u: Partial<ContactRowBlock>) => void }> = ({
  block,
  onChange,
}) => {
  const setRow = (i: number, patch: Partial<ContactRowBlock['rows'][number]>) => {
    onChange({ rows: block.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  };
  const remove = (i: number) => onChange({ rows: block.rows.filter((_, idx) => idx !== i) });
  const add = () =>
    onChange({ rows: [...block.rows, { icon: 'email', label: 'me@example.com', href: 'mailto:me@example.com' }] });

  return (
    <div className="space-y-3 text-xs">
      <ColorInput
        label={__('Color')}
        value={block.style.color}
        onChange={(v) => onChange({ style: { ...block.style, color: v } })}
      />
      <div>
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Rows')}</span>
        {block.rows.map((row, i) => (
          <div key={i} className="mb-1 grid grid-cols-[80px_1fr_1fr_24px] items-center gap-1">
            <select
              value={row.icon}
              onChange={(e) => setRow(i, { icon: e.target.value as RowIcon })}
              className="rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1"
            >
              <option value="email">email</option>
              <option value="phone">phone</option>
              <option value="web">web</option>
            </select>
            <input
              type="text"
              placeholder={__('Label')}
              className="rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1"
              value={row.label}
              onChange={(e) => setRow(i, { label: e.target.value })}
            />
            <input
              type="text"
              placeholder={__('Href')}
              className="rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1"
              value={row.href}
              onChange={(e) => setRow(i, { href: e.target.value })}
            />
            <button
              type="button"
              className="rounded p-1 text-red-600 hover:bg-red-50"
              onClick={() => remove(i)}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="rounded border border-[var(--border-default)] px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          onClick={add}
        >
          {__('+ Add row')}
        </button>
      </div>
    </div>
  );
};

const ICON_SVG: Record<RowIcon, string> = {
  // Inline base64-encoded 1x1 transparent — production swap with proper SVG
  // sprite in Sprint 9 when the email-safe rendering is finalised.
  email: '✉',
  phone: '☎',
  web: '⌂',
};

function compile(block: ContactRowBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` : '0';
  const baseStyle = [
    `font-family:${block.style.font_family}`,
    `font-size:${block.style.font_size}px`,
    `color:${block.style.color}`,
    `padding:${padding}`,
  ].join(';');

  const rows = block.rows.map((row) => {
    const safeLabel = String(row.label).replace(/[<>&]/g, (c) =>
      c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;',
    );
    return `<tr><td style="${baseStyle}"><span style="margin-right:6px">${ICON_SVG[row.icon]}</span><a href="${row.href}" style="color:${block.style.color};text-decoration:none">${safeLabel}</a></td></tr>`;
  });

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%">${rows.join('')}</table>`;
}

const definition: BlockDefinition<ContactRowBlock> = {
  type: 'contact_row',
  label: 'Contact',
  description: 'Email / phone / web rows with icons.',
  icon: Contact,
  category: 'content',
  create: (): ContactRowBlock => ({
    id: generateId('cr'),
    type: 'contact_row',
    rows: [
      { icon: 'email', label: 'me@example.com', href: 'mailto:me@example.com' },
      { icon: 'phone', label: '+1 555 123 4567', href: 'tel:+15551234567' },
    ],
    style: {
      font_family: 'Arial, sans-serif',
      font_size: 14,
      font_weight: 400,
      color: '#374151',
    },
    padding: { top: 2, right: 0, bottom: 2, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);
export { definition as contactRowDefinition };
