import type { Block, ContainerBlock, ContainerColumn, TextBlock } from '@/core/schema/blocks';

/**
 * Test fixtures for schema 1.1 containers.
 */

export const text = (id: string, content = id): TextBlock => ({
  id,
  type: 'text',
  content,
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
});

export const column = (
  id: string,
  children: Block[],
  width = 50,
  extra: Partial<ContainerColumn> = {},
): ContainerColumn => ({ id, width, children, ...extra });

/** Container with one column per entry of `lists`, even widths unless given. */
export const container = (
  id: string,
  lists: Block[][],
  extra: Partial<ContainerBlock> & { widths?: number[] } = {},
): ContainerBlock => {
  const { widths, ...rest } = extra;
  const even = Math.floor(100 / lists.length);
  return {
    id,
    type: 'container',
    gap: 16,
    columns: lists.map((children, i) =>
      column(
        `${id}-c${i}`,
        children,
        widths?.[i] ?? (i === lists.length - 1 ? 100 - even * (lists.length - 1) : even),
      ),
    ),
    ...rest,
  };
};

/** Children ids of column `index` of a container. */
export const ids = (c: Block | undefined, index: number): string[] =>
  ((c as ContainerBlock | undefined)?.columns[index]?.children ?? []).map((b) => b.id);
