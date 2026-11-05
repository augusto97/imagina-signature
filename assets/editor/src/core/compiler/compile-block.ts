import type { Block } from '@/core/schema/blocks';
import { isBoxEmpty } from '@/core/schema/box';
import { rendererForBlock, type CompileContext } from '@/core/blocks/registry';
import { __ } from '@/i18n/helpers';
import { blockLabel, report, wrapWithBlockMarkers } from './issues';
import { boxLayout, wrapInBox } from './box';

/**
 * Compiles ONE block — the single path every block takes, top-level or
 * nested in a container column:
 *
 *  1. Hidden blocks (`visible === false`) produce nothing.
 *  2. Unknown types produce nothing plus an `unknown-block` warning.
 *  3. The block's own `compile()` runs with the width that is really
 *     available to it: when the block carries a non-empty `box`, the
 *     box's inner padding and borders (and its fixed width, if any)
 *     are subtracted from `ctx.availableWidth` first.
 *  4. The result is wrapped in the email-safe box table
 *     ({@link wrapInBox}).
 *
 * The child context shares `warnings` / `issues` with `ctx` by
 * reference, so diagnostics from nested blocks surface at the top.
 *
 * With `ctx.markBlocks` the result is delimited by block boundary
 * comments for the document-level diagnostics (`compileSignature()`
 * strips them).
 */
export function compileBlock(block: Block, ctx: CompileContext): string {
  const html = compileBlockMarkup(block, ctx);
  return ctx.markBlocks === true && html !== '' ? wrapWithBlockMarkers(html, block) : html;
}

function compileBlockMarkup(block: Block, ctx: CompileContext): string {
  if (!block || block.visible === false) return '';
  const definition = rendererForBlock(block);
  if (!definition) {
    report(
      ctx,
      'warning',
      __('Unknown block type "%s" was skipped.', String(block.type)),
      block,
      'unknown-block',
    );
    return '';
  }
  const compile = definition.compile as (b: Block, c: CompileContext) => string;
  const box = block.box;
  if (!box || isBoxEmpty(box)) return compile(block, ctx);

  const layout = boxLayout(box, ctx.availableWidth);
  if (layout.clamped) {
    report(
      ctx,
      'warning',
      __(
        '%s block: its box is %spx wide but only %spx are available here; it was narrowed to fit.',
        blockLabel(block.type),
        String(Math.round(Number(box.width))),
        String(Math.floor(ctx.availableWidth)),
      ),
      block,
      'box-too-wide',
    );
  }
  const inner = compile(block, { ...ctx, availableWidth: layout.innerWidth });
  return wrapInBox(inner, box, layout);
}

/** Compiles a list of sibling blocks (hidden / unknown ones skipped). */
export function compileBlocks(blocks: readonly Block[], ctx: CompileContext): string {
  return blocks
    .map((block) => compileBlock(block, ctx))
    .filter((html) => html !== '')
    .join('\n');
}
