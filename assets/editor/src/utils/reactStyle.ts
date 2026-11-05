import type { CSSProperties } from 'react';
import type { StyleDeclarations } from '@/core/compiler/css';

/**
 * Converts a compiler declaration map (`{ 'border-left': '1px solid #ddd' }`)
 * into a React `style` object (`{ borderLeft: '1px solid #ddd' }`) so
 * canvas renderers can reuse the exact declarations the compiler emits
 * — the canvas then matches the export by construction.
 *
 * Empty values are skipped, as are Outlook-only `mso-*` properties
 * (meaningless in a browser).
 */
export function toReactStyle(decls: StyleDeclarations): CSSProperties {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(decls)) {
    if (value === undefined || value === null || value === false || value === '') continue;
    const kebab = key.replace(/_/g, '-').toLowerCase();
    if (kebab.startsWith('mso-')) continue;
    const camel = kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out as CSSProperties;
}
