import type { Padding } from '@/core/schema/styles';
import { inlineStyle, paddingCss, type StyleDeclarations } from './css';

/**
 * Converts a JS-style key/value map to a CSS inline-style string.
 *
 * Thin alias of {@link inlineStyle} (the central serializer in
 * `css.ts`): camelCase / snake_case keys are kebabed, undefined / null /
 * empty values are skipped, and every value is sanitised so the result
 * is safe inside a double-quoted `style` attribute.
 */
export function stylesToInline(styles: StyleDeclarations): string {
  return inlineStyle(styles);
}

/**
 * `Padding` → `top right bottom left` shorthand.
 */
export function paddingToCss(p?: Padding): string {
  return paddingCss(p);
}
