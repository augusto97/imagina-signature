import type { FC } from 'react';
import type { Block } from '@/core/schema/blocks';
import { rendererForBlock } from '@/core/blocks/registry';
import { BoxFrame } from './BoxFrame';

interface Props {
  block: Block;
  isPreview?: boolean;
}

/**
 * Resolves a block to its registered renderer and renders it inside
 * the block's generic box ({@link BoxFrame}) — the canvas side of
 * `compileBlock()`, so every block (top-level, nested, drag preview)
 * gets its `box` styling without its definition knowing about it.
 *
 * Unknown block types fall back to a visible diagnostic so we don't
 * silently lose data when a saved schema references a block type the
 * current bundle doesn't ship.
 */
export const BlockRenderer: FC<Props> = ({ block, isPreview }) => {
  const definition = rendererForBlock(block);

  if (!definition) {
    return (
      <div
        style={{
          padding: 8,
          border: '1px dashed #c00',
          color: '#c00',
          fontSize: 12,
        }}
      >
        Unknown block type: {block.type}
      </div>
    );
  }

  const Renderer = definition.Renderer as FC<{ block: Block; isPreview?: boolean }>;
  return (
    <BoxFrame box={block.box}>
      <Renderer block={block} isPreview={isPreview} />
    </BoxFrame>
  );
};
