import type { FC } from 'react';
import { FileText } from 'lucide-react';
import type { DisclaimerBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

const Renderer: FC<{ block: DisclaimerBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` : '0',
    fontFamily: block.style.font_family,
    fontSize: `${block.style.font_size}px`,
    color: block.style.color,
    lineHeight: block.style.line_height ?? 1.4,
  };

  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        <tr>
          <td style={td}>{block.content}</td>
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{ block: DisclaimerBlock; onChange: (u: Partial<DisclaimerBlock>) => void }> = ({
  block,
  onChange,
}) => (
  <div className="space-y-3 text-xs">
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Disclaimer text')}</span>
      <textarea
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5 text-xs"
        rows={4}
        value={block.content}
        onChange={(e) => onChange({ content: e.target.value })}
      />
    </label>
    <DimensionInput
      label={__('Font size')}
      value={block.style.font_size}
      onChange={(v) => onChange({ style: { ...block.style, font_size: v } })}
      min={8}
      max={14}
    />
    <ColorInput
      label={__('Color')}
      value={block.style.color}
      onChange={(v) => onChange({ style: { ...block.style, color: v } })}
    />
    <PaddingInput value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }} onChange={(p) => onChange({ padding: p })} />
  </div>
);

function compile(block: DisclaimerBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` : '0';
  const safe = String(block.content).replace(/[<>&]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;',
  );
  const style = [
    `font-family:${block.style.font_family}`,
    `font-size:${block.style.font_size}px`,
    `color:${block.style.color}`,
    `line-height:${block.style.line_height ?? 1.4}`,
    `padding:${padding}`,
  ].join(';');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td style="${style}">${safe}</td></tr></table>`;
}

const definition: BlockDefinition<DisclaimerBlock> = {
  type: 'disclaimer',
  label: 'Disclaimer',
  description: 'Small print at the bottom of the signature.',
  icon: FileText,
  category: 'content',
  create: (): DisclaimerBlock => ({
    id: generateId('dsc'),
    type: 'disclaimer',
    content:
      'This email and any attachments are confidential. If you received it in error, please notify the sender and delete it.',
    style: {
      font_family: 'Arial, sans-serif',
      font_size: 10,
      font_weight: 400,
      color: '#6b7280',
      line_height: 1.4,
    },
    padding: { top: 8, right: 0, bottom: 0, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);
export { definition as disclaimerDefinition };
