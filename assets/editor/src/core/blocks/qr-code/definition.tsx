import type { FC } from 'react';
import { QrCode } from 'lucide-react';
import qrcode from 'qrcode-generator';
import type { QrCodeBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

/**
 * QR Code block.
 *
 * Renders the QR as a base64 PNG `<img>` so the email payload is
 * fully self-contained — no external CDN, no upload-on-save round
 * trip. Generation is synchronous via `qrcode-generator` (~5KB) +
 * an offscreen `<canvas>` for custom-coloured modules.
 *
 * Most modern email clients (Gmail web/app, Apple Mail, Outlook
 * 365, Yahoo) render base64 PNG images inline. Older Outlook
 * clients sometimes strip them; recipients see the `alt` text as
 * a fallback.
 */
const Renderer: FC<{ block: QrCodeBlock }> = ({ block }) => {
  const dataUrl = generateQrDataURL(block);
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
    textAlign: 'center',
  };

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
            {dataUrl ? (
              <img
                src={dataUrl}
                alt={block.caption || __('QR code')}
                width={block.size}
                height={block.size}
                style={{ display: 'block', border: 0, margin: '0 auto' }}
              />
            ) : (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {__('Add data to render the QR.')}
              </span>
            )}
            {block.caption && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#475569' }}>
                {block.caption}
              </div>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{
  block: QrCodeBlock;
  onChange: (updates: Partial<QrCodeBlock>) => void;
}> = ({ block, onChange }) => (
  <div className="flex flex-col gap-3 text-[12px]">
    <label className="flex flex-col gap-1.5">
      <span className="font-medium text-[var(--text-secondary)]">
        {__('Encoded data')}
      </span>
      <textarea
        rows={3}
        value={block.data}
        onChange={(e) => onChange({ data: e.target.value })}
        placeholder="https://example.com or BEGIN:VCARD…"
      />
      <span className="text-[10.5px] text-[var(--text-muted)]">
        {__('A URL, mailto:, tel:, or any other QR-encodable string.')}
      </span>
    </label>

    <DimensionInput
      label={__('Size (px)')}
      value={block.size}
      onChange={(v) => onChange({ size: v })}
      min={64}
      max={400}
    />

    <ColorInput
      label={__('Foreground')}
      value={block.color}
      onChange={(v) => onChange({ color: v })}
    />
    <ColorInput
      label={__('Background')}
      value={block.background_color}
      onChange={(v) => onChange({ background_color: v })}
    />

    <label className="flex flex-col gap-1.5">
      <span className="font-medium text-[var(--text-secondary)]">
        {__('Caption (optional)')}
      </span>
      <input
        type="text"
        value={block.caption ?? ''}
        onChange={(e) => onChange({ caption: e.target.value || undefined })}
      />
    </label>
  </div>
);

/**
 * Generate a base64 PNG data URL for the given QR config.
 *
 * Uses an offscreen canvas so we get arbitrary fg / bg colours.
 * `qrcode-generator`'s built-in `createDataURL` is mono-colour only.
 */
function generateQrDataURL(block: QrCodeBlock): string {
  if (!block.data) return '';

  try {
    const qr = qrcode(0, 'M');
    qr.addData(block.data);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const margin = 1;
    const cellSize = Math.max(1, Math.floor(block.size / (moduleCount + margin * 2)));
    const totalSize = moduleCount * cellSize + margin * cellSize * 2;

    const canvas = document.createElement('canvas');
    canvas.width = totalSize;
    canvas.height = totalSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = block.background_color;
    ctx.fillRect(0, 0, totalSize, totalSize);

    ctx.fillStyle = block.color;
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(
            margin * cellSize + col * cellSize,
            margin * cellSize + row * cellSize,
            cellSize,
            cellSize,
          );
        }
      }
    }

    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function compile(block: QrCodeBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p
    ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`
    : '0';

  const dataUrl = generateQrDataURL(block);
  if (!dataUrl) return '';

  const captionHtml = block.caption
    ? `<div style="margin-top:4px;font-size:11px;color:#475569">${escapeHtml(block.caption)}</div>`
    : '';

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:${padding};text-align:center"><img src="${dataUrl}" alt="${escapeAttr(block.caption || 'QR code')}" width="${block.size}" height="${block.size}" style="display:block;border:0;margin:0 auto" />${captionHtml}</td></tr></table>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

const definition: BlockDefinition<QrCodeBlock> = {
  type: 'qr_code',
  label: 'QR Code',
  description: 'Scannable QR code rendered as an inline base64 PNG.',
  icon: QrCode,
  category: 'content',
  create: (): QrCodeBlock => ({
    id: generateId('qr'),
    type: 'qr_code',
    data: 'https://example.com',
    size: 120,
    color: '#000000',
    background_color: '#ffffff',
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);

export { definition as qrCodeDefinition };
