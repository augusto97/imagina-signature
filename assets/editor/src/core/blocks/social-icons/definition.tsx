import type { FC } from 'react';
import { Share2 } from 'lucide-react';
import type { SocialIconsBlock, SocialNetwork } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

const PLATFORMS = ['linkedin', 'twitter', 'facebook', 'instagram', 'github', 'youtube'] as const;

const Renderer: FC<{ block: SocialIconsBlock }> = ({ block }) => (
  <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse' }}>
    <tbody>
      <tr>
        {block.networks.map((net, i) => (
          <td key={`${net.platform}-${i}`} style={{ paddingRight: i < block.networks.length - 1 ? `${block.gap}px` : 0 }}>
            <a href={net.url} style={{ textDecoration: 'none', color: block.color }}>
              <span
                style={{
                  display: 'inline-block',
                  width: `${block.icon_size}px`,
                  height: `${block.icon_size}px`,
                  lineHeight: `${block.icon_size}px`,
                  textAlign: 'center',
                  fontSize: `${Math.round(block.icon_size * 0.45)}px`,
                  background: block.color,
                  color: '#fff',
                  borderRadius: '50%',
                  fontFamily: 'Arial, sans-serif',
                  fontWeight: 700,
                }}
              >
                {net.platform.charAt(0).toUpperCase()}
              </span>
            </a>
          </td>
        ))}
      </tr>
    </tbody>
  </table>
);

const Properties: FC<{ block: SocialIconsBlock; onChange: (u: Partial<SocialIconsBlock>) => void }> = ({
  block,
  onChange,
}) => {
  const setNetwork = (index: number, patch: Partial<SocialNetwork>) => {
    const next = block.networks.map((n, i) => (i === index ? { ...n, ...patch } : n));
    onChange({ networks: next });
  };
  const remove = (index: number) =>
    onChange({ networks: block.networks.filter((_, i) => i !== index) });
  const add = () =>
    onChange({ networks: [...block.networks, { platform: 'linkedin', url: 'https://' }] });

  return (
    <div className="space-y-3 text-xs">
      <ColorInput label={__('Icon color')} value={block.color} onChange={(v) => onChange({ color: v })} />
      <DimensionInput label={__('Size')} value={block.icon_size} onChange={(v) => onChange({ icon_size: v })} min={16} max={48} />
      <DimensionInput label={__('Gap')} value={block.gap} onChange={(v) => onChange({ gap: v })} min={0} max={32} />
      <div>
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Networks')}</span>
        {block.networks.map((net, i) => (
          <div key={i} className="mb-1 flex items-center gap-1">
            <select
              className="rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1"
              value={net.platform}
              onChange={(e) => setNetwork(i, { platform: e.target.value })}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="url"
              className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1"
              value={net.url}
              onChange={(e) => setNetwork(i, { url: e.target.value })}
            />
            <button
              type="button"
              className="rounded p-1 text-red-600 hover:bg-red-50"
              onClick={() => remove(i)}
              title={__('Remove')}
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
          {__('+ Add network')}
        </button>
      </div>
    </div>
  );
};

function compile(block: SocialIconsBlock, _ctx: CompileContext): string {
  const cells = block.networks.map((net, i) => {
    const padRight = i < block.networks.length - 1 ? block.gap : 0;
    const initial = net.platform.charAt(0).toUpperCase();
    return `<td style="padding-right:${padRight}px"><a href="${net.url}" style="text-decoration:none;color:${block.color}"><span style="display:inline-block;width:${block.icon_size}px;height:${block.icon_size}px;line-height:${block.icon_size}px;text-align:center;font-size:${Math.round(block.icon_size * 0.45)}px;background:${block.color};color:#fff;border-radius:50%;font-family:Arial,sans-serif;font-weight:700">${initial}</span></a></td>`;
  });

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>${cells.join('')}</tr></table>`;
}

const definition: BlockDefinition<SocialIconsBlock> = {
  type: 'social_icons',
  label: 'Social',
  description: 'Row of social media icons.',
  icon: Share2,
  category: 'social',
  create: (): SocialIconsBlock => ({
    id: generateId('soc'),
    type: 'social_icons',
    networks: [
      { platform: 'linkedin', url: 'https://www.linkedin.com/in/' },
      { platform: 'twitter', url: 'https://twitter.com/' },
    ],
    icon_size: 24,
    gap: 8,
    color: '#1d4ed8',
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);
export { definition as socialIconsDefinition };
