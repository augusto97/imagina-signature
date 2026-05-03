import { useState, type FC } from 'react';
import { Columns2, Plus, Trash2 } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Block, ContainerBlock } from '@/core/schema/blocks';
import { useSchemaStore, type ContainerCell } from '@/stores/schemaStore';
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
 * 1.0.31 rewrite. Pre-1.0.31 stored a single flat `children` array
 * the compiler split via `Math.ceil(length / 2)` to derive left vs
 * right cells — the user couldn't choose which children went in
 * each cell. Now the schema stores them as explicit `children`
 * (left or only cell) and `right_children` (right cell when
 * `columns === 2`).
 *
 * Each cell is a dnd-kit `SortableContext` AND a droppable zone, so:
 *   - Library cards drop into the specific cell the user hovered.
 *   - Canvas blocks drag between cells (left ↔ right) and reorder
 *     within a cell.
 *   - Empty cells are still drop targets thanks to the cell-level
 *     `useDroppable`.
 *
 * Toggling 2 → 1 in the property panel merges `right_children` back
 * into `children` so no block silently disappears.
 */
const DEFAULT_LEFT_WIDTH = 50;
const MIN_LEFT_WIDTH = 10;
const MAX_LEFT_WIDTH = 90;

function leftWidth(block: ContainerBlock): number {
  const raw = block.left_width ?? DEFAULT_LEFT_WIDTH;
  return Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, raw));
}

/**
 * Returns the right cell's children array, defaulting to empty so
 * callers don't have to null-check. Pure read — does not mutate.
 */
function rightChildrenOf(block: ContainerBlock): Block[] {
  return Array.isArray(block.right_children) ? block.right_children : [];
}

/**
 * Stable id for a cell's drop zone. Used by `useDragAndDrop` to
 * recognise drops on a cell vs drops on a child block. Kept as a
 * helper rather than inlined so the format is documented in one
 * place.
 */
export function cellDropId(containerId: string, cell: ContainerCell): string {
  return `container-cell:${containerId}:${cell}`;
}

const Renderer: FC<{ block: ContainerBlock; isPreview?: boolean }> = ({ block, isPreview }) => {
  if (block.columns === 1) {
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
            <td style={{ verticalAlign: 'top' }}>
              <CellList
                containerId={block.id}
                cell="left"
                items={block.children}
                isPreview={isPreview}
              />
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  const leftPct = leftWidth(block);
  const rightPct = 100 - leftPct;
  const right = rightChildrenOf(block);

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
          <td
            style={{
              verticalAlign: 'top',
              width: `${leftPct}%`,
              paddingRight: block.gap / 2,
            }}
          >
            <CellList
              containerId={block.id}
              cell="left"
              items={block.children}
              isPreview={isPreview}
            />
          </td>
          <td
            style={{
              verticalAlign: 'top',
              width: `${rightPct}%`,
              paddingLeft: block.gap / 2,
            }}
          >
            <CellList
              containerId={block.id}
              cell="right"
              items={right}
              isPreview={isPreview}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
};

/**
 * One cell's worth of children. Wires:
 *   - A `useDroppable` for the cell itself so the user can drop into
 *     an empty cell (no child to land "next to").
 *   - A `SortableContext` listing the cell's children — dnd-kit uses
 *     this to detect reorder drops within the cell. The actual
 *     `useSortable` hooks live one level down per child via
 *     `<SortableBlock>` (which the canvas already renders for top-
 *     level blocks; we reuse it here for nested ones too).
 *
 * The cell renders a faint dashed border when empty so the user
 * knows where to drop. Hidden in preview mode so the exported
 * email-safe HTML stays clean.
 */
const CellList: FC<{
  containerId: string;
  cell: ContainerCell;
  items: Block[];
  isPreview?: boolean;
}> = ({ containerId, cell, items, isPreview }) => {
  const dropId = cellDropId(containerId, cell);
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { cellOf: containerId, cell },
    disabled: isPreview,
  });

  const select = useSelectionStore((s) => s.select);
  const selectedId = useSelectionStore((s) => s.selectedBlockId);

  const empty = items.length === 0;

  return (
    <SortableContext
      items={items.map((item) => item.id)}
      strategy={verticalListSortingStrategy}
      id={dropId}
    >
      <div
        ref={setNodeRef}
        style={
          isPreview
            ? undefined
            : {
                minHeight: empty ? 56 : undefined,
                padding: empty ? 8 : undefined,
                border: empty ? '1px dashed #d1d5db' : undefined,
                borderRadius: empty ? 4 : undefined,
                background: isOver ? 'rgba(37, 99, 235, 0.06)' : undefined,
                transition: 'background 120ms ease',
              }
        }
      >
        {empty && !isPreview && (
          <div className="text-center text-[11px] text-[var(--text-muted)]">
            {__('Drop blocks here')}
          </div>
        )}

        {items.map((child) => {
          const def = rendererForBlock(child);
          if (!def) return null;
          const ChildRenderer = def.Renderer as FC<{ block: Block; isPreview?: boolean }>;
          const isSelected = !isPreview && child.id === selectedId;
          return (
            <div
              key={child.id}
              data-imgsig-block-id={child.id}
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
      </div>
    </SortableContext>
  );
};

const Properties: FC<{
  block: ContainerBlock;
  onChange: (u: Partial<ContainerBlock>) => void;
}> = ({ block, onChange }) => {
  const addChildToContainer = useSchemaStore((s) => s.addChildToContainer);
  const setContainerColumns = useSchemaStore((s) => s.setContainerColumns);
  const deleteBlock = useSchemaStore((s) => s.deleteBlock);
  const select = useSelectionStore((s) => s.select);
  const [adding, setAdding] = useState<ContainerCell | null>(null);

  // Eligible child types — anything except another container.
  const childCandidates = getRegisteredBlocks().filter((d) => d.type !== 'container');

  const right = rightChildrenOf(block);

  return (
    <div className="flex flex-col gap-4 text-[12px]">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-[var(--text-secondary)]">{__('Columns')}</span>
        <select
          className="w-full"
          value={block.columns}
          onChange={(e) => setContainerColumns(block.id, Number(e.target.value) as 1 | 2)}
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

      {block.columns === 1 ? (
        <CellChildrenList
          label={__('Children')}
          items={block.children}
          onAdd={() => setAdding('left')}
          adding={adding === 'left'}
          candidates={childCandidates}
          onCandidatePicked={(def) => {
            const fresh = def.create() as Block;
            addChildToContainer(block.id, fresh, 'left');
            setAdding(null);
            select(fresh.id);
          }}
          onDelete={(child) => deleteBlock(child.id)}
          onSelect={(child) => select(child.id)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <CellChildrenList
            label={__('Left cell')}
            items={block.children}
            onAdd={() => setAdding('left')}
            adding={adding === 'left'}
            candidates={childCandidates}
            onCandidatePicked={(def) => {
              const fresh = def.create() as Block;
              addChildToContainer(block.id, fresh, 'left');
              setAdding(null);
              select(fresh.id);
            }}
            onDelete={(child) => deleteBlock(child.id)}
            onSelect={(child) => select(child.id)}
          />
          <CellChildrenList
            label={__('Right cell')}
            items={right}
            onAdd={() => setAdding('right')}
            adding={adding === 'right'}
            candidates={childCandidates}
            onCandidatePicked={(def) => {
              const fresh = def.create() as Block;
              addChildToContainer(block.id, fresh, 'right');
              setAdding(null);
              select(fresh.id);
            }}
            onDelete={(child) => deleteBlock(child.id)}
            onSelect={(child) => select(child.id)}
          />
        </div>
      )}

      <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">
        {__(
          'Drag library cards directly into a cell, or drag canvas blocks between cells to rearrange.',
        )}
      </p>
    </div>
  );
};

interface CellChildrenListProps {
  label: string;
  items: Block[];
  adding: boolean;
  onAdd: () => void;
  candidates: BlockDefinition[];
  onCandidatePicked: (def: BlockDefinition) => void;
  onDelete: (child: Block) => void;
  onSelect: (child: Block) => void;
}

const CellChildrenList: FC<CellChildrenListProps> = ({
  label,
  items,
  adding,
  onAdd,
  candidates,
  onCandidatePicked,
  onDelete,
  onSelect,
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="is-section-label">{label}</span>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <Plus size={12} />
        {__('Add')}
      </button>
    </div>

    {adding && (
      <div className="grid grid-cols-2 gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-2">
        {candidates.map((def) => {
          const Icon = def.icon;
          return (
            <button
              key={def.type}
              type="button"
              onClick={() => onCandidatePicked(def)}
              className="flex items-center gap-1.5 rounded p-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)]"
            >
              <Icon size={13} className="text-[var(--text-muted)]" />
              <span className="truncate">{__(def.label)}</span>
            </button>
          );
        })}
      </div>
    )}

    {items.length === 0 ? (
      <p className="rounded-md bg-[var(--bg-panel-soft)] px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
        {__('Empty — drag here or click Add.')}
      </p>
    ) : (
      <ul className="flex flex-col gap-1">
        {items.map((child) => {
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
                onClick={() => onSelect(child)}
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
                onClick={() => onDelete(child)}
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
);

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
  const compileChild = (child: Block): string => {
    const def = rendererForBlock(child);
    if (!def) {
      ctx.warnings.push(`Unknown nested block type: ${child.type}`);
      return '';
    }
    return (def.compile as (b: Block, c: CompileContext) => string)(child, ctx);
  };

  const visibleLeft = block.children.filter((c) => c.visible !== false);
  const visibleRight = rightChildrenOf(block).filter((c) => c.visible !== false);

  if (block.columns === 1) {
    const inner = visibleLeft.map(compileChild).join('\n');
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td style="vertical-align:top">${inner}</td></tr></table>`;
  }

  const leftHtml = visibleLeft.map(compileChild).join('\n') || '&nbsp;';
  const rightHtml = visibleRight.map(compileChild).join('\n') || '&nbsp;';
  const leftPct = leftWidth(block);
  const rightPct = 100 - leftPct;
  const padRight = `padding-right:${block.gap / 2}px`;
  const padLeft = `padding-left:${block.gap / 2}px`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr><td style="vertical-align:top;width:${leftPct}%;${padRight}">${leftHtml}</td><td style="vertical-align:top;width:${rightPct}%;${padLeft}">${rightHtml}</td></tr></table>`;
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
    right_children: [],
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
  acceptsChildren: true,
};

registerBlock(definition);
export { definition as containerDefinition };
