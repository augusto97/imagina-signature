import { generateId } from '@/utils/idGenerator';
import {
  MAX_CONTAINER_COLUMNS,
  type Block,
  type ContainerBlock,
  type ContainerColumn,
} from './blocks';
import { CURRENT_SCHEMA_VERSION, type SignatureSchema } from './signature';
import { normalizeWidths } from './columns';

/**
 * Schema normalisation + migration to {@link CURRENT_SCHEMA_VERSION}.
 *
 * Run by every schema entry point (`setSchema`, `replaceSchema`,
 * `replaceSchemaForHistory`, `pasteBlock`) and by `compileSignature`
 * for raw template JSON. Idempotent and recursive.
 *
 * Container history:
 *  - pre-1.0.31: `columns: 1 | 2` + a single `children` list the old
 *    compiler split half-by-half (`Math.ceil(n / 2)` left).
 *  - 1.0 (1.0.31+): `children` (left / only cell) + `right_children`
 *    (right cell) + `left_width` (left %, default 50).
 *  - 1.1: `columns: ContainerColumn[]` (1..4), each `{ id, width,
 *    valign?, box?, children }`.
 *
 * 1.0 rows become 2 (or 1) v2 columns with the same ratio, the same
 * children in the same order and the same child ids. Already-v2 rows
 * are only normalised (ids, widths summing to 100, ≤ 4 columns, stray
 * legacy keys folded back in) so no block is ever lost.
 */
export function migrateSchemaInPlace(schema: SignatureSchema): void {
  // Current schemas are left untouched (no writes at all), so this is
  // safe to call on frozen state and costs one walk.
  if (!schemaNeedsMigration(schema)) return;
  normalizeTopLevelShapes(schema);
  migrateBlocksInPlace(schema.blocks);
  schema.schema_version = CURRENT_SCHEMA_VERSION;
}

/**
 * Back-compat name of {@link migrateSchemaInPlace} (pre-1.1 callers).
 * @deprecated Use `migrateSchemaInPlace`.
 */
export const migrateContainersInPlace = migrateSchemaInPlace;

/** Migrated deep copy; `schema` is never mutated. */
export function migrateSchema(schema: SignatureSchema): SignatureSchema {
  const copy = cloneJson(schema);
  migrateSchemaInPlace(copy);
  return copy;
}

/** Migrated deep copy of one block (e.g. a block copied before an upgrade). */
export function migrateBlock<T extends Block>(block: T): T {
  const list = [cloneJson(block)];
  migrateBlocksInPlace(list as Block[]);
  return list[0] as T;
}

/** Migrates every container in `blocks`, recursively, in place. */
export function migrateBlocksInPlace(blocks: Block[]): void {
  for (const block of blocks) {
    if (!block || typeof block !== 'object' || block.type !== 'container') continue;
    migrateContainerInPlace(block as ContainerBlock);
    for (const column of (block as ContainerBlock).columns) {
      migrateBlocksInPlace(column.children);
    }
  }
}

/**
 * Whether `schema` needs {@link migrateSchemaInPlace} — older version,
 * PHP-mangled `variables`, or any container not in the v2 shape.
 * Cheap enough to call before every compile.
 */
export function schemaNeedsMigration(schema: SignatureSchema): boolean {
  const s = schema as unknown as Record<string, unknown>;
  if (s.schema_version !== CURRENT_SCHEMA_VERSION) return true;
  if (!isPlainObject(s.variables) || !Array.isArray(s.blocks)) return true;
  return blocksNeedMigration(s.blocks as Block[]);
}

function blocksNeedMigration(blocks: Block[]): boolean {
  for (const block of blocks) {
    if (!block || typeof block !== 'object' || block.type !== 'container') continue;
    const raw = block as unknown as Record<string, unknown>;
    if (!Array.isArray(raw.columns) || 'children' in raw || 'right_children' in raw) return true;
    const columns = raw.columns as unknown[];
    if (columns.length === 0 || columns.length > MAX_CONTAINER_COLUMNS) return true;
    for (const column of columns) {
      if (!isPlainObject(column)) return true;
      if (typeof column.id !== 'string' || column.id === '') return true;
      if (typeof column.width !== 'number' || !Array.isArray(column.children)) return true;
      if (blocksNeedMigration(column.children as Block[])) return true;
    }
    const widths = columns.map((c) => (c as { width: number }).width);
    if (widths.reduce((a, b) => a + b, 0) !== 100) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** 1.0 container fields (pre-1.0.31 rows have no `right_children`). */
interface LegacyContainerFields {
  columns?: unknown;
  children?: unknown;
  right_children?: unknown;
  left_width?: unknown;
}

const DEFAULT_LEFT_WIDTH = 50;
const MIN_LEFT_WIDTH = 10;
const MAX_LEFT_WIDTH = 90;

function migrateContainerInPlace(container: ContainerBlock): void {
  const raw = container as unknown as LegacyContainerFields & Record<string, unknown>;

  if (Array.isArray(raw.columns)) {
    normalizeV2InPlace(container, raw);
    return;
  }

  // ---- 1.0 → 1.1 ---------------------------------------------------------
  const twoColumns = Number(raw.columns) >= 2;
  const children = blockList(raw.children);
  let left: Block[];
  let right: Block[];

  if (twoColumns) {
    if (Array.isArray(raw.right_children)) {
      left = children;
      right = blockList(raw.right_children);
    } else {
      // Pre-1.0.31: one list split half-by-half, exactly how the old
      // compiler laid it out.
      const half = Math.ceil(children.length / 2);
      left = children.slice(0, half);
      right = children.slice(half);
    }
  } else {
    // 1 column: a stray right list (hand-edited / legacy) folds back in.
    left = [...children, ...blockList(raw.right_children)];
    right = [];
  }

  let columns: ContainerColumn[];
  if (twoColumns) {
    const leftWidth = clampLeftWidth(raw.left_width);
    columns = [
      { id: generateId('col'), width: leftWidth, children: left },
      { id: generateId('col'), width: 100 - leftWidth, children: right },
    ];
  } else {
    columns = [{ id: generateId('col'), width: 100, children: left }];
  }

  delete raw.children;
  delete raw.right_children;
  delete raw.left_width;
  container.columns = columns;
  if (typeof container.gap !== 'number' || !Number.isFinite(container.gap)) container.gap = 0;
}

function normalizeV2InPlace(
  container: ContainerBlock,
  raw: LegacyContainerFields & Record<string, unknown>,
): void {
  const columns: ContainerColumn[] = (raw.columns as unknown[])
    .filter(isPlainObject)
    .map((c) => c as unknown as ContainerColumn);

  for (const column of columns) {
    if (typeof column.id !== 'string' || column.id === '') column.id = generateId('col');
    column.children = blockList(column.children);
  }
  if (columns.length === 0) {
    columns.push({ id: generateId('col'), width: 100, children: [] });
  }

  // Stray 1.0 keys next to a v2 `columns` array (half-migrated or
  // hand-edited rows): keep their blocks.
  const first = columns[0]!;
  const strayLeft = blockList(raw.children);
  const strayRight = blockList(raw.right_children);
  if (strayLeft.length > 0) first.children.push(...strayLeft);
  if (strayRight.length > 0) columns[columns.length - 1]!.children.push(...strayRight);
  delete raw.children;
  delete raw.right_children;
  delete raw.left_width;

  // More than the supported number of columns: fold the extras into the
  // last supported column (in order) rather than dropping them.
  while (columns.length > MAX_CONTAINER_COLUMNS) {
    const extra = columns.pop()!;
    const last = columns[columns.length - 1]!;
    last.children.push(...extra.children);
    last.width = (Number(last.width) || 0) + (Number(extra.width) || 0);
  }

  const widths = normalizeWidths(columns.map((c) => c.width));
  columns.forEach((c, i) => {
    c.width = widths[i] ?? 100;
  });

  container.columns = columns;
  if (typeof container.gap !== 'number' || !Number.isFinite(container.gap)) container.gap = 0;
}

function clampLeftWidth(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  const v = Number.isFinite(n) ? Math.round(n) : DEFAULT_LEFT_WIDTH;
  return Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, v));
}

function blockList(value: unknown): Block[] {
  return Array.isArray(value) ? (value.filter((b) => isPlainObject(b)) as unknown as Block[]) : [];
}

/**
 * PHP's `json_decode(..., true)` turns an empty `{}` into `[]`, so a
 * signature saved with no variables can come back as `variables: []`.
 * Keys added to an array are dropped by `JSON.stringify`, which would
 * silently lose the user's variables on the next save. Force the
 * object-typed fields back to plain objects.
 */
function normalizeTopLevelShapes(schema: SignatureSchema): void {
  const s = schema as unknown as Record<string, unknown>;
  for (const key of ['variables'] as const) {
    const value = s[key];
    if (!isPlainObject(value)) {
      s[key] = {};
    }
  }
  if (!Array.isArray(s.blocks)) {
    s.blocks = [];
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}
