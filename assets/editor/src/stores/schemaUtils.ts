import type { Block } from '@/core/schema/blocks';
import type { SignatureSchema } from '@/core/schema/signature';
import { columnsOf, locateBlock } from '@/core/schema/tree';
import { generateId } from '@/utils/idGenerator';

/**
 * Store-facing tree helpers shared by the schema store, the canvas, the
 * keyboard shortcuts and the template picker. The generic walkers live
 * in `core/schema/tree.ts` (re-exported here for convenience); this
 * module adds the store-flavoured pieces (sibling positions, id
 * regeneration, schema cloning, template merging).
 *
 * Nothing in here touches a store — every function takes the data it
 * works on and either returns a new value or mutates the array it was
 * handed (documented per function), so they are safe to call inside
 * immer producers and trivial to unit-test.
 */

export {
  canPlaceAtDepth,
  childLists,
  collectBlockIds,
  collectColumnIds,
  columnsOf,
  containerHeight,
  countBlocks,
  findBlock,
  findColumn,
  isDescendantOf,
  locateBlock,
  mapChildren,
  walkBlocks,
  MAX_CONTAINER_NESTING,
} from '@/core/schema/tree';

/**
 * Locate the array a block lives in (top-level or any container
 * column, at any depth) along with its index. Returns null when the id
 * is not in the tree. Thin wrapper over `locateBlock()` kept for the
 * many existing callers.
 */
export function findParentAndIndex(
  blocks: Block[],
  id: string,
): { parent: Block[]; index: number } | null {
  const loc = locateBlock(blocks, id);
  return loc ? { parent: loc.list, index: loc.index } : null;
}

/**
 * Position of a block among its siblings, or null when not found.
 * Used by the block toolbar to enable / disable move up / down.
 */
export function getSiblingPosition(
  blocks: Block[],
  id: string,
): { index: number; count: number } | null {
  const found = locateBlock(blocks, id);
  if (!found) return null;
  return { index: found.index, count: found.list.length };
}

/**
 * Derives a short id prefix from an existing id (`txt_abc_123` →
 * `txt`) so regenerated ids stay readable in devtools. Falls back to
 * `fallback` when the id has no prefix.
 */
function idPrefixFrom(id: unknown, fallback: string): string {
  const match = /^([a-z]+)_/i.exec(typeof id === 'string' ? id : '');
  if (match?.[1]) return match[1];
  return fallback.replace(/[^a-z]/gi, '').slice(0, 4) || 'b';
}

/**
 * Deep-clones a block and assigns a fresh id to it, to every container
 * column and to every block nested in it, at any depth. Used by
 * duplicate and paste so the copy never shares ids with the original
 * (shared ids make edits to the copy land on the original, collide
 * drop-zone ids, and break React keys / dnd-kit).
 */
export function cloneBlockWithFreshIds<T extends Block>(block: T): T {
  const cloned = JSON.parse(JSON.stringify(block)) as T;
  reassignIds(cloned);
  return cloned;
}

function reassignIds(block: Block): void {
  block.id = generateId(idPrefixFrom(block.id, block.type));
  for (const column of columnsOf(block)) {
    column.id = generateId(idPrefixFrom(column.id, 'col'));
    for (const child of column.children ?? []) reassignIds(child);
  }
}

/** Deep clone that tolerates immer-frozen input. */
export function cloneSchema(schema: SignatureSchema): SignatureSchema {
  return typeof structuredClone === 'function'
    ? structuredClone(schema)
    : (JSON.parse(JSON.stringify(schema)) as SignatureSchema);
}

/**
 * Builds the schema that results from applying `template` on top of
 * the user's `current` signature:
 *
 *   - Blocks and canvas come from the template.
 *   - Variables are merged: the user's existing values win for keys
 *     the template also defines, the template contributes keys the
 *     user doesn't have yet, and the user's other variables are kept
 *     (they may be referenced by text the user pastes back in).
 *   - `meta.created_at` keeps the signature's original creation date.
 *
 * Returns a fresh object — neither input is mutated. The result may
 * still be in the template's (older) schema version; `replaceSchema()`
 * migrates it.
 */
export function mergeTemplateIntoSchema(
  current: SignatureSchema,
  template: SignatureSchema,
): SignatureSchema {
  const next = cloneSchema(template);
  const now = new Date().toISOString();
  next.variables = {
    ...(template.variables ?? {}),
    ...(current.variables ?? {}),
  };
  next.meta = {
    editor_version: next.meta?.editor_version ?? current.meta?.editor_version ?? '1.0.0',
    created_at: current.meta?.created_at ?? now,
    updated_at: now,
  };
  if (!Array.isArray(next.blocks)) next.blocks = [];
  if (!next.canvas) next.canvas = { ...current.canvas };
  return next;
}
