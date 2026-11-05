import type { Block } from '@/core/schema/blocks';
import { columnsOf, isContainer, mapChildren } from '@/core/schema/tree';
import { replaceVariables, substituteVariables } from '@/core/compiler/variables';

/**
 * Canvas "Show data" mode: render blocks with their `{{variables}}`
 * resolved, the way the recipient will see them.
 *
 * {@link resolveBlockVariables} returns a deep copy of a block whose
 * string fields have every known `{{key}}` replaced — through the
 * compiler's own {@link replaceVariables} / {@link substituteVariables}
 * with the same merged map (`resolvedVariables()`), so the canvas and
 * the export always agree. Unknown keys stay as `{{key}}`, exactly like
 * the export. The input is never mutated (store state stays raw, so
 * the sidebar keeps editing tokens and autosave stores tokens).
 *
 * Field rules:
 *  - HTML fields ({@link HTML_FIELDS}, rendered with
 *    `dangerouslySetInnerHTML`) get HTML-escaped values, as in the
 *    compiled HTML; every other string gets the raw value (React
 *    escapes it when rendering).
 *  - Structural keys (`id`, `type`, `*_hash`) are copied verbatim.
 *  - {@link EXPORT_LITERAL_FIELDS} are copied verbatim too: their value
 *    is baked into a hosted file (QR PNG) without substitution, so
 *    resolving them on the canvas would show something the export
 *    doesn't contain.
 */

/** Per block type, top-level string fields that hold HTML. */
const HTML_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  text: new Set(['content']),
};

/** Per block type, fields the export never substitutes. */
const EXPORT_LITERAL_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  qr_code: new Set(['data']),
};

export interface ResolveBlockOptions {
  /**
   * What to do with a container's nested blocks:
   *  - `resolve` (default): deep-resolve the whole sub-tree;
   *  - `keep`: copy the container's own fields but keep the original
   *    children arrays — for the canvas, where every nested block goes
   *    through its own `BlockRenderer` (and so is resolved there, once).
   */
  children?: 'resolve' | 'keep';
}

/**
 * Deep copy of `block` with `{{key}}` tokens in its string fields
 * replaced by `variables` (see the module doc for the field rules).
 */
export function resolveBlockVariables<T extends Block>(
  block: T,
  variables: Record<string, string>,
  options: ResolveBlockOptions = {},
): T {
  const html = HTML_FIELDS[block.type];
  const literal = EXPORT_LITERAL_FIELDS[block.type];
  const copy: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(block)) {
    if (key === 'columns' && isContainer(block) && Array.isArray(value)) continue;
    if (isStructuralKey(key) || literal?.has(key)) {
      copy[key] = cloneValue(value);
    } else if (typeof value === 'string' && html?.has(key)) {
      copy[key] = substituteVariables(value, variables).html;
    } else {
      copy[key] = resolveValue(value, variables);
    }
  }

  if (!isContainer(block) || !Array.isArray(block.columns)) return copy as T;

  // Column fields (width, valign, box…) are resolved like any other
  // value; the children lists are mapped through the tree helper.
  copy.columns = columnsOf(block).map((column) => {
    const { children, ...rest } = column;
    return { ...(resolveValue(rest, variables) as typeof rest), children };
  });
  const keep = options.children === 'keep';
  return mapChildren(copy as T, (children) =>
    keep ? children : children.map((child) => resolveBlockVariables(child, variables, options)),
  );
}

function isStructuralKey(key: string): boolean {
  return key === 'id' || key === 'type' || key.endsWith('_hash');
}

/** Deep copy of a JSON-ish value with tokens in every string resolved. */
function resolveValue(value: unknown, variables: Record<string, string>): unknown {
  if (typeof value === 'string') return replaceVariables(value, variables).text;
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, variables));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = isStructuralKey(key) ? cloneValue(item) : resolveValue(item, variables);
    }
    return out;
  }
  return value;
}

/** Deep copy without substitution. */
function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = cloneValue(item);
    return out;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
