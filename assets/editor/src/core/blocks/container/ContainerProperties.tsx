import { useState, type FC } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { Block, ContainerBlock, ContainerColumn } from '@/core/schema/blocks';
import { MAX_CONTAINER_COLUMNS } from '@/core/schema/blocks';
import type { BorderSide, VerticalAlign } from '@/core/schema/styles';
import {
  COLUMN_LAYOUT_PRESETS,
  MIN_COLUMN_WIDTH,
  resizeColumn,
  sameWidths,
} from '@/core/schema/columns';
import { canPlaceAtDepth, locateBlock } from '@/core/schema/tree';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { BorderInput } from '@/editor/sidebar-right/inputs/BorderInput';
import { SegmentedInput } from '@/editor/sidebar-right/inputs/SegmentedInput';
import { ToggleInput } from '@/editor/sidebar-right/inputs/ToggleInput';
import { BoxStyleSection } from '@/editor/sidebar-right/sections/BoxStyleSection';
import { getRegisteredBlocks, rendererForBlock, type BlockDefinition } from '../registry';

const DEFAULT_DIVIDER: BorderSide = { width: 1, style: 'solid', color: '#e5e7eb' };

/**
 * Container property panel:
 *  - column count (1–4; removing columns moves their blocks into the
 *    previous column — nothing is lost),
 *  - layout presets as thumbnails + per-column width fine-tuning that
 *    keeps the sum at 100,
 *  - gap, divider between columns, stack-on-mobile,
 *  - one collapsible panel per column: vertical alignment, the shared
 *    Box styling (background / border / radius / padding / content
 *    alignment), reorder / remove, and the column's blocks.
 *
 * Structural edits go through the dedicated store actions
 * (`setContainerColumns`, `setContainerLayout`, `setColumnWidths`,
 * `removeContainerColumn`, `moveContainerColumn`,
 * `updateContainerColumn`, `addChildToColumn`); plain fields (gap,
 * divider, stack_on_mobile) through `onChange` → `updateBlock`.
 */
export const ContainerProperties: FC<{
  block: ContainerBlock;
  onChange: (updates: Partial<ContainerBlock>) => void;
}> = ({ block, onChange }) => {
  const setContainerColumns = useSchemaStore((s) => s.setContainerColumns);
  const setContainerLayout = useSchemaStore((s) => s.setContainerLayout);
  const setColumnWidths = useSchemaStore((s) => s.setColumnWidths);
  const columns = block.columns;
  const widths = columns.map((c) => c.width);
  const divider = block.divider;

  return (
    <div className="flex flex-col gap-4 text-[12px]">
      <SegmentedInput<number>
        label={__('Columns')}
        value={columns.length}
        onChange={(count) => setContainerColumns(block.id, count)}
        options={Array.from({ length: MAX_CONTAINER_COLUMNS }, (_, i) => ({
          value: i + 1,
          label: String(i + 1),
          title: i === 0 ? __('1 column') : __('%s columns', String(i + 1)),
        }))}
      />

      <div>
        <span className="is-section-label mb-1 block">{__('Layout')}</span>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={__('Layout presets')}>
          {COLUMN_LAYOUT_PRESETS.map((preset) => {
            const active =
              preset.widths.length === widths.length && sameWidths(preset.widths, widths);
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                aria-label={__('Layout %s', preset.label)}
                aria-pressed={active}
                onClick={() => setContainerLayout(block.id, preset.widths)}
                className={cn(
                  'flex h-8 items-stretch gap-0.5 rounded p-1 ring-1 ring-inset transition-colors',
                  active
                    ? 'bg-[var(--bg-selected)] ring-[var(--accent)]'
                    : 'bg-[var(--bg-panel)] ring-[var(--border-default)] hover:bg-[var(--bg-hover)]',
                )}
              >
                {preset.widths.map((w, i) => (
                  <span
                    key={i}
                    className={cn(
                      'rounded-[2px]',
                      active ? 'bg-[var(--accent)]/70' : 'bg-[var(--border-strong)]',
                    )}
                    style={{ flexGrow: w, flexBasis: 0 }}
                  />
                ))}
              </button>
            );
          })}
        </div>
      </div>

      {columns.length > 1 && (
        <ColumnWidthsControl widths={widths} onChange={(next) => setColumnWidths(block.id, next)} />
      )}

      <DimensionInput
        label={__('Gap')}
        value={block.gap}
        onChange={(v) => onChange({ gap: v })}
        min={0}
        max={48}
      />

      {columns.length > 1 && (
        <div className="space-y-2">
          <ToggleInput
            label={__('Divider between columns')}
            checked={!!divider}
            onChange={(on) => onChange({ divider: on ? { ...DEFAULT_DIVIDER } : undefined })}
          />
          {divider && (
            <BorderInput
              value={divider}
              maxWidth={12}
              onChange={(next) => onChange({ divider: next })}
            />
          )}
        </div>
      )}

      {columns.length > 1 && (
        <ToggleInput
          label={__('Stack columns on mobile')}
          hint={__('Narrow screens show the columns one below the other.')}
          checked={block.stack_on_mobile === true}
          onChange={(on) => onChange({ stack_on_mobile: on ? true : undefined })}
        />
      )}

      <div className="flex flex-col gap-1.5">
        {columns.map((column, index) => (
          <ColumnPanel
            key={column.id}
            container={block}
            column={column}
            index={index}
            count={columns.length}
          />
        ))}
      </div>

      <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">
        {__(
          'Drag library cards directly into a column, or drag canvas blocks between columns to rearrange.',
        )}
      </p>
    </div>
  );
};

/**
 * Per-column width inputs + a proportional bar. Editing one column
 * resizes its neighbours so the total stays at 100 % (see
 * `resizeColumn()`).
 */
const ColumnWidthsControl: FC<{ widths: number[]; onChange: (widths: number[]) => void }> = ({
  widths,
  onChange,
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <span className="is-section-label">{__('Column widths')}</span>
      <span className="font-mono text-[11px] text-[var(--text-muted)]">
        {widths.map((w) => `${w}%`).join(' / ')}
      </span>
    </div>
    <div className="flex h-2 overflow-hidden rounded bg-[var(--bg-panel-soft)] ring-1 ring-inset ring-[var(--border-default)]">
      {widths.map((w, i) => (
        <div
          key={i}
          className={i % 2 === 0 ? 'bg-[var(--accent)]/70' : 'bg-[var(--accent)]/30'}
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${widths.length}, minmax(0, 1fr))` }}
    >
      {widths.map((w, i) => (
        <label key={i} className="relative flex items-center">
          <input
            type="number"
            min={MIN_COLUMN_WIDTH}
            max={100 - MIN_COLUMN_WIDTH * (widths.length - 1)}
            aria-label={__('Column %s width', String(i + 1))}
            className="w-full pr-5 text-right"
            value={w}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next > 0) onChange(resizeColumn(widths, i, next));
            }}
          />
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">
            %
          </span>
        </label>
      ))}
    </div>
  </div>
);

/** One collapsible column: alignment, box, reorder / remove, children. */
const ColumnPanel: FC<{
  container: ContainerBlock;
  column: ContainerColumn;
  index: number;
  count: number;
}> = ({ container, column, index, count }) => {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const updateContainerColumn = useSchemaStore((s) => s.updateContainerColumn);
  const removeContainerColumn = useSchemaStore((s) => s.removeContainerColumn);
  const moveContainerColumn = useSchemaStore((s) => s.moveContainerColumn);
  const addChildToColumn = useSchemaStore((s) => s.addChildToColumn);
  const deleteBlock = useSchemaStore((s) => s.deleteBlock);
  // Depth of this column's children list: containers may only be added
  // when it stays within the nesting limit.
  const columnDepth = useSchemaStore(
    (s) => (locateBlock(s.schema.blocks, container.id)?.depth ?? 0) + 1,
  );
  const select = useSelectionStore((s) => s.select);

  const candidates = getRegisteredBlocks().filter((def) =>
    def.type === 'container' ? canPlaceAtDepth(def.create() as Block, columnDepth) : true,
  );

  const valignOptions: ReadonlyArray<{ value: VerticalAlign; label: string }> = [
    { value: 'top', label: __('Top') },
    { value: 'middle', label: __('Middle') },
    { value: 'bottom', label: __('Bottom') },
  ];

  return (
    <section className="rounded-md ring-1 ring-inset ring-[var(--border-default)]">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-1.5 text-left"
        >
          {open ? (
            <ChevronDown size={12} className="text-[var(--text-muted)]" />
          ) : (
            <ChevronRight size={12} className="text-[var(--text-muted)]" />
          )}
          <span className="text-[11.5px] font-semibold text-[var(--text-primary)]">
            {__('Column %s', String(index + 1))}
          </span>
          <span className="font-mono text-[10.5px] text-[var(--text-muted)]">{column.width}%</span>
          <span className="text-[10.5px] text-[var(--text-muted)]">
            {column.children.length === 1
              ? __('1 block')
              : __('%s blocks', String(column.children.length))}
          </span>
        </button>
        <IconButton
          label={__('Move column left')}
          disabled={index === 0}
          onClick={() => moveContainerColumn(container.id, column.id, -1)}
        >
          <ChevronLeft size={12} />
        </IconButton>
        <IconButton
          label={__('Move column right')}
          disabled={index >= count - 1}
          onClick={() => moveContainerColumn(container.id, column.id, 1)}
        >
          <ChevronRight size={12} />
        </IconButton>
        <IconButton
          label={__('Remove column (its blocks move to the neighbouring column)')}
          disabled={count <= 1}
          danger
          onClick={() => removeContainerColumn(container.id, column.id)}
        >
          <Trash2 size={12} />
        </IconButton>
      </div>

      {open && (
        <div className="space-y-3 border-t border-[var(--border-subtle)] px-2 pb-2.5 pt-2">
          <SegmentedInput<VerticalAlign>
            label={__('Vertical alignment')}
            value={column.valign ?? 'top'}
            onChange={(valign) =>
              updateContainerColumn(container.id, column.id, {
                valign: valign === 'top' ? undefined : valign,
              })
            }
            options={valignOptions}
          />

          <BoxStyleSection
            bare
            variant="column"
            value={column.box}
            onChange={(box) => updateContainerColumn(container.id, column.id, { box })}
          />

          <ColumnChildren
            items={column.children}
            adding={adding}
            onAdd={() => setAdding(!adding)}
            candidates={candidates}
            onCandidatePicked={(def) => {
              const fresh = def.create() as Block;
              if (addChildToColumn(container.id, column.id, fresh)) select(fresh.id);
              setAdding(false);
            }}
            onDelete={(child) => deleteBlock(child.id)}
            onSelect={(child) => select(child.id)}
          />
        </div>
      )}
    </section>
  );
};

const IconButton: FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, danger, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors',
      'hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent',
      danger ? 'hover:text-[var(--danger)]' : 'hover:text-[var(--text-secondary)]',
    )}
  >
    {children}
  </button>
);

interface ColumnChildrenProps {
  items: Block[];
  adding: boolean;
  onAdd: () => void;
  candidates: BlockDefinition[];
  onCandidatePicked: (def: BlockDefinition) => void;
  onDelete: (child: Block) => void;
  onSelect: (child: Block) => void;
}

const ColumnChildren: FC<ColumnChildrenProps> = ({
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
      <span className="is-section-label">{__('Blocks')}</span>
      <button
        type="button"
        onClick={onAdd}
        aria-expanded={adding}
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
              {/* i18n-dynamic: registry labels are listed in i18n/dynamic-strings.ts. */}
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
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] transition-colors hover:bg-[var(--bg-hover)]"
            >
              <button
                type="button"
                onClick={() => onSelect(child)}
                className="flex flex-1 items-center gap-2 truncate text-left"
              >
                {Icon && <Icon size={12} className="text-[var(--text-muted)]" />}
                <span className="truncate font-medium text-[var(--text-primary)]">
                  {/* i18n-dynamic: registry labels are listed in i18n/dynamic-strings.ts. */}
                  {__(def?.label ?? child.type)}
                </span>
              </button>
              <button
                type="button"
                title={__('Remove')}
                aria-label={__('Remove')}
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
