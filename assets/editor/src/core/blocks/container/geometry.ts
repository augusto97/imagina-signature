import type { ContainerBlock, ContainerColumn } from '@/core/schema/blocks';
import type { BorderSide, Padding } from '@/core/schema/styles';
import { isVisibleBorder, resolveBorderSides } from '@/core/schema/box';
import { normalizeWidths } from '@/core/schema/columns';
import { boxAlign, borderDeclarations } from '@/core/compiler/box';
import { parseColor, px, type StyleDeclarations } from '@/core/compiler/css';

/**
 * Pixel geometry + cell styling of a container's columns, shared by
 * the compiler (`compileContainer.ts`) and the canvas renderer
 * (`ContainerBlock.tsx`) so both lay columns out identically.
 *
 * Model (per column i of N, inside `available` px):
 *  - OUTER width: the column's percentage share of `available`,
 *    rounded on cumulative edges so the N widths sum to `available`
 *    exactly (what the `width` attribute of each cell carries).
 *  - The gap is split in halves applied as padding on the inner edges:
 *    `padding-right: gap/2` on columns 1..N-1, `padding-left: gap/2`
 *    on columns 2..N.
 *  - The optional divider is a `border-left` on columns 2..N (it
 *    replaces that column's own left box border).
 *  - The column box (background, borders, radius, padding, alignment)
 *    is painted on the cell itself so a tinted column spans the full
 *    row height; its padding adds to the gap halves.
 *  - INNER width — what the column's children may use — is the outer
 *    width minus all of the above.
 */
export interface ColumnGeometry {
  column: ContainerColumn;
  index: number;
  /** Normalised percentage (the columns sum to 100). */
  percent: number;
  /** Outer px width (cell `width` attribute); outers sum to `available`. */
  outer: number;
  /** Gap half on the left edge (columns 2..N). */
  gapLeft: number;
  /** Gap half on the right edge (columns 1..N-1). */
  gapRight: number;
  /** Divider drawn as this column's left border, if any. */
  divider: BorderSide | null;
  /** Px available to the column's children. */
  inner: number;
}

/** The container's divider when it draws something valid, else null. */
export function effectiveDivider(block: Pick<ContainerBlock, 'divider'>): BorderSide | null {
  const d = block.divider;
  return isVisibleBorder(d) && parseColor(d.color) ? d : null;
}

export function containerGeometry(
  block: Pick<ContainerBlock, 'columns' | 'gap' | 'divider'>,
  available: number,
): ColumnGeometry[] {
  const columns = Array.isArray(block.columns) ? block.columns : [];
  const n = columns.length;
  if (n === 0) return [];
  const total = Math.max(1, Math.round(available));
  const widths = normalizeWidths(columns.map((c) => c.width));
  const halfGap = px(block.gap, 0, 200, 0) / 2;
  const divider = effectiveDivider(block);
  const dividerWidth = divider ? px(divider.width, 0, 50) : 0;

  let cumulative = 0;
  let previousEdge = 0;
  return columns.map((column, index) => {
    cumulative += widths[index] ?? 0;
    const edge = index === n - 1 ? total : Math.round((total * cumulative) / 100);
    const outer = Math.max(1, edge - previousEdge);
    previousEdge = edge;

    const gapLeft = index > 0 ? halfGap : 0;
    const gapRight = index < n - 1 ? halfGap : 0;
    const columnDivider = index > 0 ? divider : null;

    const sides = resolveBorderSides(column.box);
    const pad = column.box?.padding;
    const borderLeft = columnDivider ? dividerWidth : sides.left ? px(sides.left.width, 0, 50) : 0;
    const borderRight = sides.right ? px(sides.right.width, 0, 50) : 0;
    const consumed =
      gapLeft +
      gapRight +
      borderLeft +
      borderRight +
      px(pad?.left, 0, 400) +
      px(pad?.right, 0, 400);

    return {
      column,
      index,
      percent: widths[index] ?? 100,
      outer,
      gapLeft,
      gapRight,
      divider: columnDivider,
      inner: Math.max(1, Math.floor(outer - consumed)),
    };
  });
}

function paddingShorthand(p: Padding): string {
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
}

/**
 * Inline declarations of one column cell: vertical alignment, width %,
 * gap halves, divider, and the column box. `includeWidth: false` drops
 * the `width:%` (stacked layouts).
 */
export function columnCellDeclarations(
  geo: ColumnGeometry,
  options: { includeWidth?: boolean } = {},
): StyleDeclarations {
  const { column } = geo;
  const box = column.box;
  const valign = column.valign ?? 'top';
  const radius = px(box?.border_radius, 0, 999, 0);
  const align = boxAlign(box);

  let padding: StyleDeclarations;
  if (box?.padding) {
    padding = {
      padding: paddingShorthand({
        top: px(box.padding.top, 0, 400),
        right: px(box.padding.right, 0, 400) + geo.gapRight,
        bottom: px(box.padding.bottom, 0, 400),
        left: px(box.padding.left, 0, 400) + geo.gapLeft,
      }),
    };
  } else {
    padding = {
      'padding-left': geo.gapLeft > 0 ? `${geo.gapLeft}px` : undefined,
      'padding-right': geo.gapRight > 0 ? `${geo.gapRight}px` : undefined,
    };
  }

  return {
    'vertical-align': valign,
    width: options.includeWidth === false ? undefined : `${geo.percent}%`,
    'background-color': parseColor(box?.background_color) ?? undefined,
    ...borderDeclarations(box, geo.divider ? { left: geo.divider } : {}),
    'border-radius': radius > 0 ? `${radius}px` : undefined,
    ...padding,
    'text-align': align !== 'left' ? align : undefined,
  };
}

/** Whether any column paints rounded corners (needs `border-collapse:separate`). */
export function hasRoundedColumns(block: Pick<ContainerBlock, 'columns'>): boolean {
  return (block.columns ?? []).some((c) => px(c.box?.border_radius, 0, 999, 0) > 0);
}
