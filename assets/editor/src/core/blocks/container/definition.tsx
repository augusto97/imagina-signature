import { useState, type FC } from 'react';
import { Columns2, Plus, Trash2 } from 'lucide-react';
import type { Block } from '@/core/schema/blocks';
import type { ContainerBlock } from '@/core/schema/blocks';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import {
  registerBlock,
  rendererForBlock,
  getRegisteredBlocks,
  type BlockDefinition,
  type CompileContext,
} from '../registry';

/**
 * 1-or-2 column container.
 *
 * Children are real `Block`s rendered through the registry, not
 * placeholder strings. For a 2-column layout we split the flat
 * `children` array in half visually so any add / remove flow stays
 * a single splice. Compile is recursive — the container renders an
 * email-safe `<table>` and embeds each child's own compiled HTML.
 *
 * Editing nested children: the canvas renderer wires every child to
 * the same selection store, so clicking a nested image / text opens
 * the right-sidebar property panel like any top-level block. The
 * panel finds the block by id via {@link findBlockByIdDeep} which
 * recurses into containers.
 *
 * Drag-and-drop reordering inside cells is deferred — the typical
 * signature is one column anyway, and add / remove via the
 * container's own property panel covers the multi-column case.
 */
const DEFAULT_LEFT_WIDTH = 50;
const MIN_LEFT_WIDTH = 10;
const MAX_LEFT_WIDTH = 90;

function leftWidth(block: ContainerBlock): number {
  const raw = block.left_width ?? DEFAULT_LEFT_WIDTH;
  return Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, raw));
}

const Renderer: FC<{ block: ContainerBlock; isPreview?: boolean }> = ({ block, isPreview }) => {
  const cells: React.ReactNode[] = [];
  const half = Math.ceil(block.children.length / 2);

  if (block.columns === 1) {
    cells.push(
      <td key="single" style={{ verticalAlign: 'top' }}>
        <ChildList items={block.children} isPreview={isPreview} />
      </td>,
    );
  } else {
    const leftPct = leftWidth(block);
    const widths = [`${leftPct}%`, `${100 - leftPct}%`];
    for (let i = 0; i < 2; i++) {
      const start = i * half;
      const slice = block.children.slice(start, start + half);
      cells.push(
        <td
          key={i}
          style={{
            verticalAlign: 'top',
            paddingLeft: i === 0 ? 0 : block.gap / 2,
            paddingRight: i === 1 ? 0 : block.gap / 2,
            width: widths[i],
          }}
        >
          <ChildList items={slice} isPreview={isPreview} />
        </td>,
      );
    }
  }

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse', width: '100%' }}
    >
      <tbody>
        <tr>{cells}</tr>
      </tbody>
    </table>
  );
};

const ChildList: FC<{ items: Block[]; isPreview?: boolean }> = ({ items, isPreview }) => {
  const select = useSelectionStore((s) => s.select);
  const selectedId = useSelectionStore((s) => s.selectedBlockId);

  if (items.length === 0) {
    if (isPreview) return null;
    return (
      <div
        style={{
          padding: 12,
          fontSize: 11,
          color: '#94a3b8',
          textAlign: 'center',
          border: '1px dashed #e5e7eb',
          borderRadius: 4,
        }}
      >
        {__('Empty column')}
      </div>
    );
  }

  return (
    <>
      {items.map((child) => {
        const def = rendererForBlock(child);
        if (!def) return null;
        const ChildRenderer = def.Renderer as FC<{ block: Block; isPreview?: boolean }>;
        const isSelected = !isPreview && child.id === selectedId;
        return (
          <div
            key={child.id}
            onClick={
              isPreview
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    select(child.id);
                  }
            }
            style={
              isPreview
                ? { marginBottom: 4 }
                : {
                    marginBottom: 4,
                    cursor: 'pointer',
                    outline: isSelected ? '1px solid #2563eb' : '1px solid transparent',
                    borderRadius: 2,
                  }
            }
          >
            <ChildRenderer block={child} isPreview={isPreview} />
          </div>
        );
      })}
    </>
  );
};

const Properties: FC<{
  block: ContainerBlock;
  onChange: (u: Partial<ContainerBlock>) => void;
}> = ({ block, onChange }) => {
  const addChildToContainer = useSchemaStore((s) => s.addChildToContainer);
  const deleteBlock = useSchemaStore((s) => s.deleteBlock);
  const select = useSelectionStore((s) => s.select);
  const [adding, setAdding] = useState(false);

  // Eligible child types — anything except another container (nesting
  // containers is a footgun for email rendering and we don't support it).
  const childCandidates = getRegisteredBlocks().filter((d) => d.type !== 'container');

  return (
    <div className="flex flex-col gap-4 text-[12px]">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-[var(--text-secondary)]">{__('Columns')}</span>
        <select
          className="w-full"
          value={block.columns}
          onChange={(e) => onChange({ columns: Number(e.target.value) as 1 | 2 })}
        >
          <option value={1}>{__('1 column')}</option>
          <option value={2}>{__('2 columns')}</option>
        </select>
      </label>

      <DimensionInput
        label={__('Gap')}
        value={block.gap}
        onChange={(v) => onChange({ gap: v })}
        min={0}
        max={48}
      />

      {block.columns === 2 && <ColumnWidthControl block={block} onChange={onChange} />}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="is-section-label">{__('Children')}</span>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <Plus size={12} />
            {__('Add')}
          </button>
        </div>

        {adding && (
          <div className="grid grid-cols-2 gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-2">
            {childCandidates.map((def) => {
              const Icon = def.icon;
              return (
                <button
                  key={def.type}
                  type="button"
                  onClick={() => {
                    const fresh = def.create() as Block;
                    addChildToContainer(block.id, fresh);
                    setAdding(false);
                    select(fresh.id);
                  }}
                  className="flex items-center gap-1.5 rounded p-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <Icon size={13} className="text-[var(--text-muted)]" />
                  <span className="truncate">{__(def.label)}</span>
                </button>
              );
            })}
          </div>
        )}

        {block.children.length === 0 ? (
          <p className="rounded-md bg-[var(--bg-panel-soft)] px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
            {__('No children yet — click “Add” to drop a block into this container.')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {block.children.map((child) => {
              const def = rendererForBlock(child);
              const Icon = def?.icon;
              return (
                <li
                  key={child.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] transition-colors',
                    'hover:bg-[var(--bg-hover)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => select(child.id)}
                    className="flex flex-1 items-center gap-2 truncate text-left"
                  >
                    {Icon && <Icon size={12} className="text-[var(--text-muted)]" />}
                    <span className="truncate font-medium text-[var(--text-primary)]">
                      {__(def?.label ?? child.type)}
                    </span>
                  </button>
                  <button
                    type="button"
                    title={__('Remove')}
                    onClick={() => deleteBlock(child.id)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] opacity-0 hover:bg-red-50 hover:text-[var(--danger)] group-hover:opacity-100"
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">
        {__('Children are split evenly between cells. Reorder via Layers.')}
      </p>
    </div>
  );
};

const COLUMN_WIDTH_PRESETS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '1 / 4', value: 25 },
  { label: '1 / 3', value: 33 },
  { label: '1 / 2', value: 50 },
  { label: '2 / 3', value: 67 },
  { label: '3 / 4', value: 75 },
];

const ColumnWidthControl: FC<{
  block: ContainerBlock;
  onChange: (u: Partial<ContainerBlock>) => void;
}> = ({ block, onChange }) => {
  const left = leftWidth(block);
  const right = 100 - left;

  const set = (next: number): void => {
    const clamped = Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, Math.round(next)));
    onChange({ left_width: clamped });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-[var(--text-secondary)]">{__('Column widths')}</span>
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          {left}% / {right}%
        </span>
      </div>

      {/* Visual preview — two bars sized like the cells will render. */}
      <div className="flex h-2 overflow-hidden rounded bg-[var(--bg-panel-soft)] ring-1 ring-inset ring-[var(--border-default)]">
        <div className="bg-[var(--accent)]/70" style={{ width: `${left}%` }} />
        <div className="bg-[var(--accent)]/30" style={{ width: `${right}%` }} />
      </div>

      <input
        type="range"
        min={MIN_LEFT_WIDTH}
        max={MAX_LEFT_WIDTH}
        step={1}
        value={left}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full"
      />

      <div className="flex flex-wrap gap-1">
        {COLUMN_WIDTH_PRESETS.map(({ label, value }) => {
          const active = left === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => set(value)}
              className={cn(
                'h-6 rounded px-2 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-[var(--bg-selected)] text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/30'
                  : 'text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-default)] hover:bg-[var(--bg-hover)]',
              )}
              title={`${value}% / ${100 - value}%`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

function compile(block: ContainerBlock, ctx: CompileContext): string {
  const half = Math.ceil(block.children.length / 2);

  const compileChild = (child: Block): string => {
    const def = rendererForBlock(child);
    if (!def) {
      ctx.warnings.push(`Unknown nested block type: ${child.type}`);
      return '';
    }
    return (def.compile as (b: Block, c: CompileContext) => string)(child, ctx);
  };

  if (block.columns === 1) {
    const inner = block.children.map(compileChild).join('\n');
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td style="vertical-align:top">${inner}</td></tr></table>`;
  }

  const left = block.children.slice(0, half).map(compileChild).join('\n');
  const right = block.children.slice(half).map(compileChild).join('\n');
  const leftPct = leftWidth(block);
  const rightPct = 100 - leftPct;
  const padRight = `padding-right:${block.gap / 2}px`;
  const padLeft = `padding-left:${block.gap / 2}px`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td style="vertical-align:top;width:${leftPct}%;${padRight}">${left}</td><td style="vertical-align:top;width:${rightPct}%;${padLeft}">${right}</td></tr></table>`;
}

const definition: BlockDefinition<ContainerBlock> = {
  type: 'container',
  label: 'Container',
  description: '1 or 2 column layout with embedded blocks.',
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
