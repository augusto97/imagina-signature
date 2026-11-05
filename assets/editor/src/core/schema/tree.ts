import type { Block, ContainerBlock, ContainerColumn } from './blocks';

/**
 * Generic, shape-agnostic helpers for walking the block tree.
 *
 * Every piece of code that needs to look INSIDE a block (store
 * actions, the Layers panel, asset sync, export fixers, plain text,
 * id regeneration…) goes through these instead of special-casing a
 * container's fields, so adding another block that hosts children only
 * means teaching {@link childLists} about it.
 *
 * Nothing here touches a store. Functions either return new values or
 * hand back LIVE references into the tree they were given (documented
 * per function), so they are safe inside immer producers.
 *
 * Input is assumed to be schema 1.1 (every entry point runs
 * `migrateSchemaInPlace()` first); malformed containers (no `columns`
 * array) simply report no children.
 */

/**
 * Container nesting allowed in a signature: a container may sit in a
 * column of a top-level container (2 levels), but not deeper. Enforced
 * by the store's insert / move / paste actions and by drag-and-drop.
 */
export const MAX_CONTAINER_NESTING = 2;

/** Narrowing helper. */
export function isContainer(block: Block | null | undefined): block is ContainerBlock {
  return !!block && block.type === 'container';
}

/** A container's columns (empty for any other block or a malformed row). Live reference. */
export function columnsOf(block: Block): ContainerColumn[] {
  if (!isContainer(block)) return [];
  return Array.isArray(block.columns) ? block.columns : [];
}

/**
 * Every child list a block owns, in visual order — one per container
 * column. Live references: mutating an array mutates the block.
 */
export function childLists(block: Block): Block[][] {
  return columnsOf(block)
    .map((column) => column.children)
    .filter((children): children is Block[] => Array.isArray(children));
}

/** Whether the block owns at least one child list (i.e. can host blocks). */
export function hostsChildren(block: Block): boolean {
  return childLists(block).length > 0;
}

/** Where a block lives in the tree. */
export interface BlockLocation {
  /** The array holding the block: the top-level list or a column's `children`. Live. */
  list: Block[];
  /** Index of the block in `list`. */
  index: number;
  /** Enclosing container, or null at the top level. */
  container: ContainerBlock | null;
  /** Enclosing column, or null at the top level. */
  column: ContainerColumn | null;
  /** Number of containers enclosing `list` (0 = top level). */
  depth: number;
}

/**
 * Pre-order walk over every block at every depth. Return `false` from
 * `visit` to skip that block's children.
 */
export function walkBlocks(
  blocks: Block[],
  visit: (block: Block, location: BlockLocation) => void | boolean,
): void {
  const walkList = (
    list: Block[],
    container: ContainerBlock | null,
    column: ContainerColumn | null,
    depth: number,
  ): void => {
    for (let index = 0; index < list.length; index++) {
      const block = list[index];
      if (!block) continue;
      if (visit(block, { list, index, container, column, depth }) === false) continue;
      for (const col of columnsOf(block)) {
        if (Array.isArray(col.children))
          walkList(col.children, block as ContainerBlock, col, depth + 1);
      }
    }
  };
  walkList(blocks, null, null, 0);
}

/** First block matching `predicate` (pre-order), with its location. */
export function findInTree(
  blocks: Block[],
  predicate: (block: Block) => boolean,
): { block: Block; location: BlockLocation } | null {
  let hit: { block: Block; location: BlockLocation } | null = null;
  const search = (
    list: Block[],
    container: ContainerBlock | null,
    column: ContainerColumn | null,
    depth: number,
  ): boolean => {
    for (let index = 0; index < list.length; index++) {
      const block = list[index];
      if (!block) continue;
      if (predicate(block)) {
        hit = { block, location: { list, index, container, column, depth } };
        return true;
      }
      for (const col of columnsOf(block)) {
        if (
          Array.isArray(col.children) &&
          search(col.children, block as ContainerBlock, col, depth + 1)
        ) {
          return true;
        }
      }
    }
    return false;
  };
  search(blocks, null, null, 0);
  return hit;
}

/** Block with `id` at any depth. Live reference. */
export function findBlock(blocks: Block[], id: string): Block | undefined {
  return findInTree(blocks, (b) => b.id === id)?.block;
}

/** Location of the block with `id` (its parent list, index, container, column, depth). */
export function locateBlock(blocks: Block[], id: string): BlockLocation | null {
  return findInTree(blocks, (b) => b.id === id)?.location ?? null;
}

/** A column located in the tree. */
export interface ColumnLocation {
  container: ContainerBlock;
  column: ContainerColumn;
  /** Index of the column in `container.columns`. */
  index: number;
  /** Depth of the column's `children` list (1 for a top-level container). */
  depth: number;
}

/** Finds column `columnId` of container `containerId`. Live references. */
export function findColumn(
  blocks: Block[],
  containerId: string,
  columnId: string,
): ColumnLocation | null {
  const found = findInTree(blocks, (b) => b.id === containerId);
  if (!found || !isContainer(found.block)) return null;
  const columns = columnsOf(found.block);
  const index = columns.findIndex((c) => c.id === columnId);
  const column = columns[index];
  if (!column) return null;
  return { container: found.block, column, index, depth: found.location.depth + 1 };
}

/**
 * Immutable map over a block's child lists: returns a copy of the
 * block whose column `children` are replaced by `fn`'s result, or the
 * block itself when it hosts no children.
 */
export function mapChildren<T extends Block>(
  block: T,
  fn: (children: Block[], column: ContainerColumn, index: number) => Block[],
): T {
  if (!isContainer(block) || !Array.isArray(block.columns)) return block;
  return {
    ...block,
    columns: block.columns.map((column, index) => ({
      ...column,
      children: fn(Array.isArray(column.children) ? column.children : [], column, index),
    })),
  };
}

/** Every block id in the tree, pre-order. */
export function collectBlockIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  walkBlocks(blocks, (block) => {
    ids.push(block.id);
  });
  return ids;
}

/** Every container column id in the tree, pre-order. */
export function collectColumnIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  walkBlocks(blocks, (block) => {
    for (const column of columnsOf(block)) ids.push(column.id);
  });
  return ids;
}

/** Number of blocks in the tree, counted recursively. */
export function countBlocks(blocks: Block[]): number {
  let n = 0;
  walkBlocks(blocks, () => {
    n++;
  });
  return n;
}

/**
 * How many container levels a block brings with it: 0 for a leaf, 1
 * for a container of leaves, 2 for a container holding a container…
 */
export function containerHeight(block: Block): number {
  if (!isContainer(block)) return 0;
  let deepest = 0;
  for (const children of childLists(block)) {
    for (const child of children) deepest = Math.max(deepest, containerHeight(child));
  }
  return 1 + deepest;
}

/**
 * Whether `block` may be placed in a list enclosed by `depth`
 * containers without exceeding {@link MAX_CONTAINER_NESTING}.
 */
export function canPlaceAtDepth(block: Block, depth: number): boolean {
  return depth + containerHeight(block) <= MAX_CONTAINER_NESTING;
}

/**
 * Whether `id` lives somewhere inside the sub-tree rooted at
 * `ancestorId` (the ancestor itself does not count). Guards drag-and-
 * drop against moving a container into one of its own columns.
 */
export function isDescendantOf(blocks: Block[], ancestorId: string, id: string): boolean {
  const ancestor = findBlock(blocks, ancestorId);
  if (!ancestor) return false;
  return childLists(ancestor).some((children) => findBlock(children, id) !== undefined);
}
