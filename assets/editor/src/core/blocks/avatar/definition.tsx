import type { FC } from 'react';
import { CircleUserRound } from 'lucide-react';
import type { AvatarBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

const Renderer: FC<{ block: AvatarBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` : '0',
  };

  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          <td style={td}>
            <img
              src={block.src || `https://placehold.co/${block.size}x${block.size}?text=A`}
              alt={block.alt}
              width={block.size}
              height={block.size}
              style={{
                display: 'block',
                width: `${block.size}px`,
                height: `${block.size}px`,
                borderRadius: '50%',
                objectFit: 'cover',
                border: 0,
              }}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{ block: AvatarBlock; onChange: (u: Partial<AvatarBlock>) => void }> = ({ block, onChange }) => (
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
    <DimensionInput label={__('Size')} value={block.size} onChange={(v) => onChange({ size: v })} min={32} max={200} />
    <PaddingInput value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }} onChange={(p) => onChange({ padding: p })} />
  </div>
);

function compile(block: AvatarBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` : '0';
  const alt = String(block.alt).replace(/"/g, '&quot;');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:${padding}"><img src="${block.src}" alt="${alt}" width="${block.size}" height="${block.size}" style="display:block;width:${block.size}px;height:${block.size}px;border-radius:50%;object-fit:cover;border:0" /></td></tr></table>`;
}

const definition: BlockDefinition<AvatarBlock> = {
  type: 'avatar',
  label: 'Avatar',
  description: 'Round profile image.',
  icon: CircleUserRound,
  category: 'content',
  create: (): AvatarBlock => ({
    id: generateId('av'),
    type: 'avatar',
    src: '',
    alt: '',
    size: 64,
    padding: { top: 0, right: 0, bottom: 8, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);
export { definition as avatarDefinition };
