import type { FC } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { ImageBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

const Renderer: FC<{ block: ImageBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
    textAlign: 'left',
  };

  const img = (
    <img
      src={block.src || 'https://placehold.co/120x120?text=Image'}
      alt={block.alt}
      width={block.width}
      height={block.height}
      style={{
        display: 'block',
        maxWidth: '100%',
        height: 'auto',
        border: 0,
        borderRadius: block.border_radius ? `${block.border_radius}px` : 0,
      }}
    />
  );

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
          <td style={td}>{block.link ? <a href={block.link}>{img}</a> : img}</td>
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{ block: ImageBlock; onChange: (updates: Partial<ImageBlock>) => void }> = ({
  block,
  onChange,
}) => (
  <div className="space-y-3 text-xs">
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Image URL')}</span>
      <input
        type="url"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.src}
        onChange={(e) => onChange({ src: e.target.value })}
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Alt text')}</span>
      <input
        type="text"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.alt}
        onChange={(e) => onChange({ alt: e.target.value })}
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Width (px)')}</span>
      <input
        type="number"
        min={1}
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.width ?? ''}
        onChange={(e) =>
          onChange({ width: e.target.value === '' ? undefined : Number(e.target.value) })
        }
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Border radius (px)')}</span>
      <input
        type="number"
        min={0}
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.border_radius ?? 0}
        onChange={(e) => onChange({ border_radius: Number(e.target.value) })}
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Link (optional)')}</span>
      <input
        type="url"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.link ?? ''}
        onChange={(e) => onChange({ link: e.target.value || undefined })}
      />
    </label>
  </div>
);

function compile(block: ImageBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p
    ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`
    : '0';
  const widthAttr = block.width ? ` width="${block.width}"` : '';
  const heightAttr = block.height ? ` height="${block.height}"` : '';
  const radius = block.border_radius
    ? `;border-radius:${block.border_radius}px`
    : '';
  const img = `<img src="${block.src}" alt="${escapeAttr(block.alt)}"${widthAttr}${heightAttr} style="display:block;max-width:100%;height:auto;border:0${radius}" />`;
  const inner = block.link ? `<a href="${block.link}">${img}</a>` : img;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:${padding}">${inner}</td></tr></table>`;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

const definition: BlockDefinition<ImageBlock> = {
  type: 'image',
  label: 'Image',
  description: 'A single image with optional link.',
  icon: ImageIcon,
  category: 'content',

  create: (): ImageBlock => ({
    id: generateId('img'),
    type: 'image',
    src: '',
    alt: '',
    width: 120,
    border_radius: 0,
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),

  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);

export { definition as imageDefinition };
