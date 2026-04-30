import type { FC } from 'react';
import { Minus } from 'lucide-react';
import type { DividerBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

const Renderer: FC<{ block: DividerBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
  };

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse', width: `${block.width_percent}%` }}
    >
      <tbody>
        <tr>
          <td style={td}>
            <div
              style={{
                height: 0,
                borderTop: `${block.border.width}px ${block.border.style} ${block.border.color}`,
              }}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{
  block: DividerBlock;
  onChange: (updates: Partial<DividerBlock>) => void;
}> = ({ block, onChange }) => (
  <div className="space-y-3 text-xs">
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Color')}</span>
      <input
        type="color"
        className="h-8 w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)]"
        value={block.border.color}
        onChange={(e) => onChange({ border: { ...block.border, color: e.target.value } })}
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Thickness (px)')}</span>
      <input
        type="number"
        min={1}
        max={10}
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.border.width}
        onChange={(e) =>
          onChange({ border: { ...block.border, width: Number(e.target.value) || 1 } })
        }
      />
    </label>
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Width (%)')}</span>
      <input
        type="number"
        min={10}
        max={100}
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.width_percent}
        onChange={(e) => onChange({ width_percent: Number(e.target.value) || 100 })}
      />
    </label>
  </div>
);

function compile(block: DividerBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p
    ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`
    : '0';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:${block.width_percent}%"><tr><td style="padding:${padding}"><div style="height:0;border-top:${block.border.width}px ${block.border.style} ${block.border.color}"></div></td></tr></table>`;
}

const definition: BlockDefinition<DividerBlock> = {
  type: 'divider',
  label: 'Divider',
  description: 'Horizontal line.',
  icon: Minus,
  category: 'layout',

  create: (): DividerBlock => ({
    id: generateId('div'),
    type: 'divider',
    border: { width: 1, color: '#e5e7eb', style: 'solid' },
    width_percent: 100,
    padding: { top: 8, right: 0, bottom: 8, left: 0 },
  }),

  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);

export { definition as dividerDefinition };
