import type { FC } from 'react';
import { Columns2 } from 'lucide-react';
import type { ContainerBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

/**
 * 1-or-2 column container.
 *
 * Sprint 8 ships a minimal version: the container renders a `<table>`
 * with 1 or 2 cells side-by-side, and any children are rendered
 * stacked inside each cell. Full nested drag-and-drop (each cell as
 * its own SortableContext) is deferred — the typical signature is
 * one column anyway, and the multi-column case is rare enough that
 * landing it later doesn't block useful editing now.
 */
const Renderer: FC<{ block: ContainerBlock }> = ({ block }) => {
  const cells: React.ReactNode[] = [];
  const half = Math.ceil(block.children.length / 2);

  if (block.columns === 1) {
    cells.push(
      <td key="single" style={{ verticalAlign: 'top' }}>
        {block.children.map((child) => (
          <div key={child.id} style={{ marginBottom: 4 }}>
            {`[${child.type}]`}
          </div>
        ))}
      </td>,
    );
  } else {
    for (let i = 0; i < 2; i++) {
      const start = i * half;
      const slice = block.children.slice(start, start + half);
      cells.push(
        <td
          key={i}
          style={{
            verticalAlign: 'top',
            paddingLeft: i === 0 ? 0 : block.gap,
            paddingRight: i === 1 ? 0 : block.gap / 2,
            width: '50%',
          }}
        >
          {slice.map((child) => (
            <div key={child.id} style={{ marginBottom: 4 }}>
              {`[${child.type}]`}
            </div>
          ))}
        </td>,
      );
    }
  }

  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        <tr>{cells}</tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{ block: ContainerBlock; onChange: (u: Partial<ContainerBlock>) => void }> = ({
  block,
  onChange,
}) => (
  <div className="space-y-3 text-xs">
    <label className="block">
      <span className="mb-1 block text-[var(--text-secondary)]">{__('Columns')}</span>
      <select
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5"
        value={block.columns}
        onChange={(e) => onChange({ columns: Number(e.target.value) as 1 | 2 })}
      >
        <option value={1}>1</option>
        <option value={2}>2</option>
      </select>
    </label>
    <DimensionInput label={__('Gap')} value={block.gap} onChange={(v) => onChange({ gap: v })} min={0} max={48} />
    <p className="text-[var(--text-muted)]">
      {__('Nested drag-and-drop into containers ships in a later release. For now, blocks added inside the container are placeholders.')}
    </p>
  </div>
);

function compile(block: ContainerBlock, ctx: CompileContext): string {
  // Children are out-of-scope for this minimal container; the full
  // recursive compile lands when nested DnD does.
  void ctx;
  if (block.columns === 1) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td></td></tr></table>`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td style="vertical-align:top;width:50%;padding-right:${block.gap / 2}px"></td><td style="vertical-align:top;width:50%;padding-left:${block.gap / 2}px"></td></tr></table>`;
}

const definition: BlockDefinition<ContainerBlock> = {
  type: 'container',
  label: 'Container',
  description: '1 or 2 column layout.',
  icon: Columns2,
  category: 'layout',
  create: (): ContainerBlock => ({
    id: generateId('cnt'),
    type: 'container',
    columns: 2,
    gap: 16,
    children: [],
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
  acceptsChildren: true,
};

registerBlock(definition);
export { definition as containerDefinition };
