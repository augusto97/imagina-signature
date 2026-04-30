import type { SignatureSchema } from '@/core/schema/signature';
import { rendererForBlock, type CompileContext } from '@/core/blocks/registry';
import { wrapInEmailShell } from './table-builder';
import { applyOutlookFixes } from './outlook-fixes';
import { minifyHtml } from './minify';
import { validateEmailHtml } from './validate';

export interface CompileResult {
  html: string;
  warnings: string[];
  size: number;
}

/**
 * JSON → email-safe HTML compiler entry point (CLAUDE.md §9.2).
 *
 * Five stages, each pure:
 *   1. Compile each block via its registered `compile()` and
 *      concatenate.
 *   2. Wrap in the email shell (DOCTYPE + mso pixels-per-inch +
 *      outer table sized to canvas.width).
 *   3. Apply Outlook-specific fixes (mso line-height, conditional
 *      reset).
 *   4. Minify (drop non-conditional comments + inter-tag whitespace).
 *   5. Run validation, returning warnings alongside the HTML so the
 *      Export modal can surface them.
 *
 * Unknown block types contribute nothing to the output but produce
 * a warning so the bug is visible.
 */
export function compileSignature(schema: SignatureSchema): CompileResult {
  const ctx: CompileContext = {
    variables: schema.variables,
    warnings: [],
  };

  const blockChunks: string[] = [];
  for (const block of schema.blocks) {
    const definition = rendererForBlock(block);
    if (!definition) {
      ctx.warnings.push(`Unknown block type "${block.type}" was skipped.`);
      continue;
    }
    // Each block compiler is a pure function; trust it to return a
    // string. Errors bubble up — nothing here catches.
    blockChunks.push(definition.compile(block as never, ctx));
  }

  const concatenated = blockChunks.join('\n');
  const shelled = wrapInEmailShell(concatenated, schema.canvas);
  const withOutlookFixes = applyOutlookFixes(shelled);
  const minified = minifyHtml(withOutlookFixes);
  const validationWarnings = validateEmailHtml(minified);

  return {
    html: minified,
    warnings: [...ctx.warnings, ...validationWarnings],
    size: new Blob([minified]).size,
  };
}
