import type { BrandKit } from '@shared/brandKit';
import type { SignatureSchema } from '@/core/schema/signature';
import { __ } from '@admin/i18n';
import {
  checkDisclaimerSize,
  collectVariableNames,
  exchangeVariables,
  toAsciiHtml,
  withGuard,
  type SizeCheck,
} from './transportRule';

export interface ExchangeCompileResult {
  /** Disclaimer HTML: the signature fragment, guard appended, ASCII-only. */
  html: string;
  size: SizeCheck;
  /** Variables turned into Exchange tokens. */
  mapped: string[];
  /** Variables with no Exchange equivalent, rendered empty. */
  emptied: string[];
  /** Error-level compiler diagnostics (broken for recipients). */
  errors: string[];
}

/**
 * Compiles a template for an Exchange mail flow rule, in the admin's
 * browser, with the editor's own compiler (`compileSignature`).
 *
 * The compiler and the block registry are loaded on demand (a separate
 * chunk), so the admin bundle only pays for them when an admin actually
 * generates a rule.
 */
export async function compileForExchange(
  schemaInput: unknown,
  options: { brandKit?: BrandKit | null; guard: string },
): Promise<ExchangeCompileResult> {
  if (!isSchemaLike(schemaInput)) {
    throw new Error(__('This template has no signature content.'));
  }

  const [{ compileSignature }] = await Promise.all([
    import('@/core/compiler/compile'),
    import('@/core/blocks'),
  ]);

  const schema = schemaInput as SignatureSchema;
  const names = collectVariableNames(schema);
  const { values, mapped, emptied } = exchangeVariables(names, {
    brandKit: options.brandKit,
    templateVariables: (schema.variables ?? {}) as Record<string, unknown>,
  });

  const result = compileSignature({ ...schema, variables: values });
  const html = toAsciiHtml(withGuard(result.fragment, options.guard));

  return { html, size: checkDisclaimerSize(html), mapped, emptied, errors: result.errors };
}

function isSchemaLike(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { blocks?: unknown }).blocks) &&
    typeof (value as { canvas?: unknown }).canvas === 'object'
  );
}
