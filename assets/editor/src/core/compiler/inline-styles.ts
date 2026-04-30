import type { Padding } from '@/core/schema/styles';

/**
 * Converts a JS-style key/value map to a CSS inline-style string.
 *
 * Camel-case keys are kebabed, undefined / null / empty values
 * are skipped (so callers can build maps unconditionally without
 * littering the output with `key:undefined`).
 */
export function stylesToInline(styles: Record<string, string | number | undefined | null>): string {
  return Object.entries(styles)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${kebabCase(k)}:${v}`)
    .join(';');
}

/**
 * `Padding` → `top right bottom left` shorthand.
 */
export function paddingToCss(p?: Padding): string {
  if (!p) return '0';
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
}

function kebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
