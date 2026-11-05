import { generateId } from '@/utils/idGenerator';
import {
  MAX_CONTAINER_COLUMNS,
  type Block,
  type ContainerBlock,
  type ContainerColumn,
} from './blocks';

/**
 * Pure helpers for container column layouts: width normalisation,
 * presets, resizing and column-count changes that never lose blocks.
 *
 * Widths are integer percentages that always sum to 100, each at least
 * {@link MIN_COLUMN_WIDTH}. The `…InPlace` helpers mutate the container
 * they are given (safe on immer drafts and on freshly-cloned data).
 */

/** Narrowest column, in percent. */
export const MIN_COLUMN_WIDTH = 10;

/** A clickable layout preset in the container panel. */
export interface ColumnLayoutPreset {
  id: string;
  /** Display label, e.g. "33 / 67". */
  label: string;
  /** Normalised widths (sum 100). */
  widths: number[];
}

export const COLUMN_LAYOUT_PRESETS: readonly ColumnLayoutPreset[] = [
  { id: '100', label: '100', widths: [100] },
  { id: '50-50', label: '50 / 50', widths: [50, 50] },
  { id: '33-67', label: '33 / 67', widths: [33, 67] },
  { id: '67-33', label: '67 / 33', widths: [67, 33] },
  { id: '25-75', label: '25 / 75', widths: [25, 75] },
  { id: '33-33-33', label: '33 / 33 / 33', widths: [33, 33, 34] },
  { id: '25-50-25', label: '25 / 50 / 25', widths: [25, 50, 25] },
  { id: '25-25-25-25', label: '25 / 25 / 25 / 25', widths: [25, 25, 25, 25] },
];

/** Clamps a column count to 1..{@link MAX_CONTAINER_COLUMNS}. */
export function clampColumnCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(MAX_CONTAINER_COLUMNS, Math.round(count)));
}

/**
 * Integer percentages summing to exactly 100, each ≥ MIN_COLUMN_WIDTH,
 * proportional to `widths`. Non-numeric / non-positive entries count as
 * an even share.
 */
export function normalizeWidths(widths: readonly unknown[]): number[] {
  const n = widths.length;
  if (n === 0) return [];
  if (n === 1) return [100];
  const raw = widths.map((w) => {
    const v = typeof w === 'number' ? w : Number.parseFloat(String(w ?? ''));
    return Number.isFinite(v) && v > 0 ? v : 100 / n;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  const out = raw.map((w) => Math.max(MIN_COLUMN_WIDTH, Math.round((w * 100) / sum)));

  let diff = 100 - out.reduce((a, b) => a + b, 0);
  // Settle rounding / minimum-width drift one point at a time on the
  // widest column(s) — the change is least visible there.
  let guard = 400;
  while (diff !== 0 && guard-- > 0) {
    let pick = -1;
    for (let i = 0; i < n; i++) {
      const v = out[i] ?? 0;
      if (diff < 0 && v <= MIN_COLUMN_WIDTH) continue;
      if (pick === -1 || v >= (out[pick] ?? 0)) pick = i;
    }
    if (pick === -1) break;
    out[pick] = (out[pick] ?? 0) + (diff > 0 ? 1 : -1);
    diff += diff > 0 ? -1 : 1;
  }
  return out;
}

/** Even split for `count` columns (`3` → `[33, 33, 34]`). */
export function evenWidths(count: number): number[] {
  return normalizeWidths(new Array<number>(clampColumnCount(count)).fill(1));
}

/** Whether two width lists describe the same layout once normalised. */
export function sameWidths(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const na = normalizeWidths(a);
  const nb = normalizeWidths(b);
  return na.every((w, i) => w === nb[i]);
}

/** The preset matching `widths`, if any. */
export function matchPreset(widths: readonly number[]): ColumnLayoutPreset | undefined {
  return COLUMN_LAYOUT_PRESETS.find((p) => sameWidths(p.widths, widths));
}

/**
 * Sets column `index` to `next` percent and keeps the sum at 100: the
 * difference is absorbed by the following column(s) first, then the
 * preceding ones, never pushing any column below MIN_COLUMN_WIDTH.
 */
export function resizeColumn(widths: readonly number[], index: number, next: number): number[] {
  const n = widths.length;
  if (n <= 1) return [100];
  const out = normalizeWidths(widths);
  if (index < 0 || index >= n || !Number.isFinite(next)) return out;
  const max = 100 - MIN_COLUMN_WIDTH * (n - 1);
  const target = Math.max(MIN_COLUMN_WIDTH, Math.min(max, Math.round(next)));
  let delta = (out[index] ?? 0) - target;
  out[index] = target;

  const order: number[] = [];
  for (let j = index + 1; j < n; j++) order.push(j);
  for (let j = index - 1; j >= 0; j--) order.push(j);
  for (const j of order) {
    if (delta === 0) break;
    const current = out[j] ?? 0;
    if (delta > 0) {
      out[j] = current + delta;
      delta = 0;
    } else {
      const take = Math.min(current - MIN_COLUMN_WIDTH, -delta);
      out[j] = current - take;
      delta += take;
    }
  }
  return out;
}

/** A fresh, empty column. */
export function createColumn(width: number, children: Block[] = []): ContainerColumn {
  return { id: generateId('col'), width, children };
}

/** Fresh columns for the given widths. */
export function createColumns(widths: readonly number[]): ContainerColumn[] {
  return normalizeWidths(widths).map((w) => createColumn(w));
}

/** Writes normalised `widths` onto the container's columns (lengths must match). */
export function applyWidthsInPlace(container: ContainerBlock, widths: readonly number[]): void {
  if (widths.length !== container.columns.length) return;
  normalizeWidths(widths).forEach((w, i) => {
    const column = container.columns[i];
    if (column) column.width = w;
  });
}

/**
 * Removes column `index`. Its children move to the END of the previous
 * column (or to the START of the next one when the first column is
 * removed) and that column absorbs the removed width. A container never
 * drops below one column. Returns false when nothing was removed.
 */
export function removeColumnInPlace(container: ContainerBlock, index: number): boolean {
  const columns = container.columns;
  if (columns.length <= 1 || index < 0 || index >= columns.length) return false;
  const [removed] = columns.splice(index, 1);
  if (!removed) return false;
  const receiverIndex = index > 0 ? index - 1 : 0;
  const receiver = columns[receiverIndex];
  if (!receiver) return false;
  if (index > 0) {
    receiver.children.push(...removed.children);
  } else {
    receiver.children.unshift(...removed.children);
  }
  receiver.width += removed.width;
  applyWidthsInPlace(
    container,
    columns.map((c) => c.width),
  );
  return true;
}

/**
 * Changes the number of columns to `count` (clamped 1..4) and applies
 * `widths` (defaults to an even split). Added columns are empty;
 * removed trailing columns hand their children to the last kept column,
 * in order — no block is ever dropped.
 */
export function setColumnCountInPlace(
  container: ContainerBlock,
  count: number,
  widths?: readonly number[],
): void {
  const target = clampColumnCount(count);
  const columns = container.columns;
  while (columns.length > target) {
    removeColumnInPlace(container, columns.length - 1);
  }
  while (columns.length < target) {
    columns.push(createColumn(0));
  }
  const next = widths && widths.length === target ? widths : evenWidths(target);
  applyWidthsInPlace(container, next);
}
