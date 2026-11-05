import type { Block, ContainerBlock } from '@/core/schema/blocks';
import type { SignatureSchema } from '@/core/schema/signature';
import { generateId } from '@/utils/idGenerator';

/**
 * Pure tree helpers shared by the schema store, the canvas, the
 * keyboard shortcuts and the template picker. Nothing in here touches
 * a store — every function takes the data it works on and either
 * returns a new value or mutates the array it was handed (documented
 * per function), so they are safe to call inside immer producers and
 * trivial to unit-test.
 */

/**
 * Returns both child arrays of a container as a list of arrays to
 * walk. Order is left, right.
 */
export function containerCellArrays(c: ContainerBlock): Block[][] {
  const arrays: Block[][] = [c.children];
  if (Array.isArray(c.right_children)) arrays.push(c.right_children);
  return arrays;
}

/**
 * Locate the array a block lives in (top-level or any container cell,
 * at any depth) along with its index. Returns null when the id is not
 * in the tree.
 */
export function findParentAndIndex(
  blocks: Block[],
  id: string,
): { parent: Block[]; index: number } | null {
  const topIdx = blocks.findIndex((b) => b.id === id);
  if (topIdx >= 0) return { parent: blocks, index: topIdx };

  for (const block of blocks) {
    if (block.type === 'container') {
      for (const cell of containerCellArrays(block)) {
        const inner = findParentAndIndex(cell, id);
        if (inner) return inner;
      }
    }
  }
  return null;
}

/**
 * Position of a block among its siblings, or null when not found.
 * Used by the block toolbar to enable / disable move up / down.
 */
export function getSiblingPosition(
  blocks: Block[],
  id: string,
): { index: number; count: number } | null {
  const found = findParentAndIndex(blocks, id);
  if (!found) return null;
  return { index: found.index, count: found.parent.length };
}

/**
 * Whether `id` lives somewhere inside the sub-tree rooted at
 * `ancestorId` (the ancestor itself does not count). Guards drag-and-
 * drop against moving a container into one of its own cells.
 */
export function isDescendantOf(blocks: Block[], ancestorId: string, id: string): boolean {
  const ancestor = findBlockDeep(blocks, ancestorId);
  if (!ancestor || ancestor.type !== 'container') return false;
  for (const cell of containerCellArrays(ancestor)) {
    if (findBlockDeep(cell, id)) return true;
  }
  return false;
}

function findBlockDeep(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.type === 'container') {
      for (const cell of containerCellArrays(block)) {
        const found = findBlockDeep(cell, id);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/**
 * Derives a short id prefix from an existing id (`txt_abc_123` →
 * `txt`) so regenerated ids stay readable in devtools. Falls back to
 * the block type's first letters when the id has no prefix.
 */
function idPrefixFor(block: Block): string {
  const match = /^([a-z]+)_/i.exec(block.id);
  if (match?.[1]) return match[1];
  return block.type.replace(/[^a-z]/gi, '').slice(0, 4) || 'b';
}

/**
 * Deep-clones a block and assigns a fresh id to it AND to every block
 * nested in it — both container cells (`children` and
 * `right_children`), at any depth. Used by duplicate and paste so the
 * copy never shares ids with the original (shared ids make edits to
 * the copy land on the original, and break React keys / dnd-kit).
 */
export function cloneBlockWithFreshIds<T extends Block>(block: T): T {
  const cloned = JSON.parse(JSON.stringify(block)) as T;
  reassignIds(cloned);
  return cloned;
}

function reassignIds(block: Block): void {
  block.id = generateId(idPrefixFor(block));
  if (block.type === 'container') {
    for (const cell of containerCellArrays(block)) {
      for (const child of cell) reassignIds(child);
    }
  }
}

/** Collects every block id in the tree (pre-order). */
export function collectBlockIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    ids.push(block.id);
    if (block.type === 'container') {
      for (const cell of containerCellArrays(block)) ids.push(...collectBlockIds(cell));
    }
  }
  return ids;
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
 * Returns a fresh object — neither input is mutated.
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
