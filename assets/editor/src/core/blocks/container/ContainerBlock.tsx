import type { FC } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type {
  Block,
  ContainerBlock as ContainerBlockType,
  ContainerColumn,
} from '@/core/schema/blocks';
import { boxAlign } from '@/core/compiler/box';
import { useDeviceStore } from '@/stores/deviceStore';
import { __ } from '@/i18n/helpers';
import { toReactStyle } from '@/utils/reactStyle';
import { SortableBlock } from '@/editor/canvas/SortableBlock';
import { BlockRenderer } from '@/editor/canvas/BlockRenderer';
import { cellDropId, noShiftSortingStrategy } from '@/editor/canvas/dnd';
import { columnCellDeclarations, containerGeometry, hasRoundedColumns } from './geometry';

/** Nominal width for the canvas geometry: only %s and px paddings are used. */
const CANVAS_GEOMETRY_WIDTH = 600;

/**
 * Canvas renderer of a container (v2): one table cell per column with
 * the same declarations the compiler emits (width %, gap halves,
 * divider, valign, column box — see `geometry.ts`).
 *
 * Each column is a drop zone + `SortableContext` (see
 * {@link ColumnZone}), so library cards drop into the hovered column,
 * blocks drag between columns and empty columns still accept drops.
 *
 * Mobile preview: with `stack_on_mobile` on and the device switcher on
 * "mobile", the columns render one below the other — what narrow mail
 * clients show for the hybrid export.
 */
export const ContainerRenderer: FC<{ block: ContainerBlockType; isPreview?: boolean }> = ({
  block,
  isPreview,
}) => {
  const device = useDeviceStore((s) => s.device);
  const stacked = block.stack_on_mobile === true && device === 'mobile';
  const geometry = containerGeometry(block, CANVAS_GEOMETRY_WIDTH);
  const separate = hasRoundedColumns(block);

  const tableStyle: React.CSSProperties = {
    borderCollapse: separate ? 'separate' : 'collapse',
    borderSpacing: separate ? 0 : undefined,
    width: '100%',
    tableLayout: stacked ? undefined : 'fixed',
  };

  const cell = (geo: (typeof geometry)[number]) => {
    const align = boxAlign(geo.column.box);
    return (
      <td
        key={geo.column.id}
        valign={geo.column.valign ?? 'top'}
        align={align !== 'left' ? align : undefined}
        data-imgsig-column={geo.column.id}
        style={toReactStyle(columnCellDeclarations(geo, { includeWidth: !stacked }))}
      >
        <ColumnZone containerId={block.id} column={geo.column} isPreview={isPreview} />
      </td>
    );
  };

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={tableStyle}
      data-imgsig-stacked={stacked ? '' : undefined}
    >
      <tbody>
        {stacked ? (
          geometry.map((geo) => <tr key={geo.column.id}>{cell(geo)}</tr>)
        ) : (
          <tr>{geometry.map(cell)}</tr>
        )}
      </tbody>
    </table>
  );
};

/**
 * One column's children. Wires:
 *   - a `useDroppable` for the column itself (a drop "zone") so the
 *     user can drop into an empty column, and so drops in the gaps
 *     between children resolve to the nearest child (editor/canvas/dnd.ts);
 *   - a `SortableContext` listing the column's children, each a full
 *     {@link SortableBlock} (selection / hover outline, floating
 *     toolbar, drop indicator) — the same wrapper top-level blocks use.
 *
 * Empty columns render a faint dashed drop target. In preview mode
 * (drag overlay) children render bare via {@link BlockRenderer}
 * (boxes included) without sortable registration, so the overlay never
 * registers duplicate droppable ids.
 */
const ColumnZone: FC<{
  containerId: string;
  column: ContainerColumn;
  isPreview?: boolean;
}> = ({ containerId, column, isPreview }) => {
  const dropId = cellDropId(containerId, column.id);
  const items: Block[] = column.children;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { cellOf: containerId, columnId: column.id },
    disabled: isPreview,
  });
  const empty = items.length === 0;

  if (isPreview) {
    return (
      <div>
        {items.map((child) => (
          <BlockRenderer key={child.id} block={child} isPreview />
        ))}
      </div>
    );
  }

  return (
    <SortableContext
      items={items.map((item) => item.id)}
      strategy={noShiftSortingStrategy}
      id={dropId}
    >
      <div
        ref={setNodeRef}
        style={{
          minHeight: empty ? 56 : undefined,
          padding: empty ? 8 : undefined,
          border: empty ? `1px dashed ${isOver ? '#2563eb' : '#d1d5db'}` : undefined,
          borderRadius: empty ? 4 : undefined,
          background: isOver ? 'rgba(37, 99, 235, 0.06)' : undefined,
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
      >
        {empty && (
          <div className="text-center text-[11px] text-[var(--text-muted)]">
            {__('Drop blocks here')}
          </div>
        )}
        {items.map((child) => (
          <SortableBlock key={child.id} block={child} zone={dropId} />
        ))}
      </div>
    </SortableContext>
  );
};
