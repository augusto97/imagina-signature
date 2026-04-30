import type { FC } from 'react';
import { Heading as HeadingIcon } from 'lucide-react';
import type { HeadingBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { FontFamilyInput } from '@/editor/sidebar-right/inputs/FontFamilyInput';
import { FontWeightInput } from '@/editor/sidebar-right/inputs/FontWeightInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

const Renderer: FC<{ block: HeadingBlock }> = ({ block }) => {
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
    fontFamily: block.style.font_family,
    fontSize: `${block.style.font_size}px`,
    fontWeight: block.style.font_weight,
    color: block.style.color,
    lineHeight: block.style.line_height ?? 1.2,
    textAlign: block.style.text_align ?? 'left',
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

const Properties: FC<{ block: HeadingBlock; onChange: (u: Partial<HeadingBlock>) => void }> = ({ block, onChange }) => {
  const setStyle = <K extends keyof HeadingBlock['style']>(k: K, v: HeadingBlock['style'][K]) =>
    onChange({ style: { ...block.style, [k]: v } });

  return (
    <div className="space-y-4 text-xs">
      <label className="block">
        <span className="mb-1 block text-[var(--text-secondary)]">{__('Text')}</span>
        <input
          type="text"
          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
          value={block.content}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      </label>
      <FontFamilyInput label={__('Font')} value={block.style.font_family} onChange={(v) => setStyle('font_family', v)} />
      <DimensionInput label={__('Size')} value={block.style.font_size} onChange={(v) => setStyle('font_size', v)} min={10} max={72} />
      <FontWeightInput label={__('Weight')} value={block.style.font_weight} onChange={(v) => setStyle('font_weight', v)} />
      <ColorInput label={__('Color')} value={block.style.color} onChange={(v) => setStyle('color', v)} />
      <PaddingInput value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }} onChange={(p) => onChange({ padding: p })} />
    </div>
  );
};

function compile(block: HeadingBlock, _ctx: CompileContext): string {
  const p = block.padding;
  const padding = p ? `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` : '0';
  const style = [
    `font-family:${block.style.font_family}`,
    `font-size:${block.style.font_size}px`,
    `font-weight:${block.style.font_weight}`,
    `color:${block.style.color}`,
    `line-height:${block.style.line_height ?? 1.2}`,
    `text-align:${block.style.text_align ?? 'left'}`,
    `padding:${padding}`,
  ].join(';');

  const safe = String(block.content).replace(/[<>&]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;',
  );
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td style="${style}">${safe}</td></tr></table>`;
}

const definition: BlockDefinition<HeadingBlock> = {
  type: 'heading',
  label: 'Heading',
  description: 'Larger text for emphasis.',
  icon: HeadingIcon,
  category: 'content',
  create: (): HeadingBlock => ({
    id: generateId('h'),
    type: 'heading',
    content: 'Your Name',
    style: {
      font_family: 'Arial, sans-serif',
      font_size: 18,
      font_weight: 700,
      color: '#111827',
      line_height: 1.2,
      text_align: 'left',
    },
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);
export { definition as headingDefinition };
