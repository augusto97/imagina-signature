import type { FC } from 'react';
import { ArrowUpDown } from 'lucide-react';
import type { SpacerBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

const Renderer: FC<{ block: SpacerBlock }> = ({ block }) => (
  <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
    <tbody>
      <tr>
        <td style={{ height: `${block.height}px`, fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
      </tr>
    </tbody>
  </table>
);

const Properties: FC<{ block: SpacerBlock; onChange: (u: Partial<SpacerBlock>) => void }> = ({ block, onChange }) => (
  <div className="space-y-3 text-xs">
    <DimensionInput label={__('Height')} value={block.height} onChange={(v) => onChange({ height: v })} min={1} max={400} />
  </div>
);

function compile(block: SpacerBlock, _ctx: CompileContext): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td style="height:${block.height}px;font-size:0;line-height:0">&nbsp;</td></tr></table>`;
}

const definition: BlockDefinition<SpacerBlock> = {
  type: 'spacer',
  label: 'Spacer',
  description: 'Vertical empty space.',
  icon: ArrowUpDown,
  category: 'layout',
  create: (): SpacerBlock => ({ id: generateId('sp'), type: 'spacer', height: 16 }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);
export { definition as spacerDefinition };
