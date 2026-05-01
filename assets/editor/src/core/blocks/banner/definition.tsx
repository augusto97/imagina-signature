import type { FC } from 'react';
import { Megaphone } from 'lucide-react';
import type { BannerBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

/**
 * Banner block — promotional / campaign image with a link.
 *
 * Looks like an Image block but typed differently because it carries
 * its own scale defaults (full canvas width by default, 16:5
 * aspect-ish), and surfaces banner-specific affordances in the
 * library card. Lives in the `content` category.
 */
const Renderer: FC<{ block: BannerBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
    textAlign: 'center',
  };

  const img = (
    <img
      src={block.src || 'https://placehold.co/600x180?text=Banner'}
      alt={block.alt}
      width={block.width}
      style={{
        display: 'block',
        maxWidth: '100%',
        height: 'auto',
        border: 0,
        borderRadius: block.border_radius ? `${block.border_radius}px` : 0,
        margin: '0 auto',
      }}
    />
  );

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse', width: '100%' }}
    >
      <tbody>
        <tr>
          <td style={td}>{block.link ? <a href={block.link}>{img}</a> : img}</td>
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{
  block: BannerBlock;
  onChange: (updates: Partial<BannerBlock>) => void;
}> = ({ block, onChange }) => (
  <div className="flex flex-col gap-3 text-[12px]">
    <label className="flex flex-col gap-1.5">
      <span className="font-medium text-[var(--text-secondary)]">{__('Image URL')}</span>
      <input
        type="url"
        value={block.src}
        onChange={(e) => onChange({ src: e.target.value })}
        placeholder="https://example.com/banner.png"
      />
    </label>

    <label className="flex flex-col gap-1.5">
      <span className="font-medium text-[var(--text-secondary)]">{__('Alt text')}</span>
      <input
        type="text"
        value={block.alt}
        onChange={(e) => onChange({ alt: e.target.value })}
        placeholder={__('Describe what the banner shows')}
      />
    </label>

    <label className="flex flex-col gap-1.5">
      <span className="font-medium text-[var(--text-secondary)]">{__('Link URL')}</span>
      <input
        type="url"
        value={block.link}
        onChange={(e) => onChange({ link: e.target.value })}
        placeholder="https://example.com/landing"
      />
    </label>

    <DimensionInput
      label={__('Width (px)')}
      value={block.width}
      onChange={(v) => onChange({ width: v })}
      min={120}
      max={800}
    />

    <DimensionInput
      label={__('Border radius (px)')}
      value={block.border_radius ?? 0}
      onChange={(v) => onChange({ border_radius: v })}
      min={0}
      max={32}
    />
  </div>
);

function compile(block: BannerBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` : '0';
  const widthAttr = block.width ? ` width="${block.width}"` : '';
  const radius = block.border_radius
    ? `;border-radius:${block.border_radius}px`
    : '';
  const img = `<img src="${block.src}" alt="${escapeAttr(block.alt)}"${widthAttr} style="display:block;max-width:100%;height:auto;border:0;margin:0 auto${radius}" />`;
  const inner = block.link ? `<a href="${block.link}">${img}</a>` : img;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td style="padding:${padding};text-align:center">${inner}</td></tr></table>`;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

const definition: BlockDefinition<BannerBlock> = {
  type: 'banner',
  label: 'Banner',
  description: 'Promotional banner image with a click-through link.',
  icon: Megaphone,
  category: 'content',
  create: (): BannerBlock => ({
    id: generateId('banner'),
    type: 'banner',
    src: '',
    alt: '',
    link: '',
    width: 600,
    border_radius: 0,
    padding: { top: 8, right: 0, bottom: 8, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);

export { definition as bannerDefinition };
