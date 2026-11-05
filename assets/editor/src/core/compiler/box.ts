import type { BorderSide, BoxAlign, BoxStyle, Padding } from '@/core/schema/styles';
import {
  BOX_SIDES,
  boxInsets,
  isBoxEmpty,
  resolveBorderSides,
  type BoxSide,
} from '@/core/schema/box';
import {
  bgcolorAttr,
  borderStyle,
  inlineStyle,
  intPx,
  parseColor,
  px,
  type StyleDeclarations,
} from './css';

/**
 * Email-safe rendering of a {@link BoxStyle} — used by `compileBlock`
 * around EVERY block and by the container compiler for column cells.
 * The canvas mirrors the same declarations through
 * {@link boxCellDeclarations} so editor and export agree.
 *
 * Every value goes through the central serializer (`css.ts`).
 */

/** `1px solid #e5e7eb`, or `''` when the side draws nothing / is invalid. */
export function borderCss(side: BorderSide | null | undefined): string {
  if (!side || !(Number(side.width) > 0)) return '';
  const color = parseColor(side.color);
  if (!color) return '';
  return `${px(side.width, 0, 50)}px ${borderStyle(side.style)} ${color}`;
}

/** Normalised alignment (`left` when unset / invalid). */
export function boxAlign(box: BoxStyle | null | undefined): BoxAlign {
  return box?.align === 'center' || box?.align === 'right' ? box.align : 'left';
}

/**
 * Border declarations for the four sides. Collapses to the `border`
 * shorthand when all four sides are identical (shorter HTML).
 *
 * `overrides` replaces individual sides (the container divider takes
 * the left edge of columns 2..N).
 */
export function borderDeclarations(
  box: BoxStyle | null | undefined,
  overrides: Partial<Record<BoxSide, BorderSide | null>> = {},
): StyleDeclarations {
  const sides = { ...resolveBorderSides(box), ...overrides };
  const css = BOX_SIDES.map((side) => borderCss(sides[side]));
  if (css[0] !== '' && css.every((c) => c === css[0])) {
    return { border: css[0] };
  }
  const out: StyleDeclarations = {};
  BOX_SIDES.forEach((side, i) => {
    if (css[i]) out[`border-${side}`] = css[i];
  });
  return out;
}

/** `top right bottom left` px shorthand for a padding, clamped. */
function paddingShorthand(p: Padding): string {
  return `${px(p.top, 0, 400)}px ${px(p.right, 0, 400)}px ${px(p.bottom, 0, 400)}px ${px(p.left, 0, 400)}px`;
}

/**
 * Declarations for the cell that paints the box: background, borders,
 * radius, inner padding and content alignment.
 */
export function boxCellDeclarations(box: BoxStyle): StyleDeclarations {
  const radius = px(box.border_radius, 0, 999, 0);
  const align = boxAlign(box);
  return {
    'background-color': parseColor(box.background_color) ?? undefined,
    ...borderDeclarations(box),
    'border-radius': radius > 0 ? `${radius}px` : undefined,
    padding: box.padding ? paddingShorthand(box.padding) : undefined,
    'text-align': align !== 'left' ? align : undefined,
  };
}

/** Geometry of a box placed in `available` px. */
export interface BoxLayout {
  /** Fixed outer width in px, or null when the box spans the available width. */
  fixedWidth: number | null;
  /** True when the requested fixed width had to shrink to fit. */
  clamped: boolean;
  /** Px left for the content (outer − padding − borders). */
  innerWidth: number;
}

export function boxLayout(box: BoxStyle, available: number): BoxLayout {
  const avail = Math.max(1, Math.floor(available));
  const requested = Number(box.width) > 0 ? intPx(box.width, 1, 4000, avail) : 0;
  const fixedWidth = requested > 0 ? Math.min(requested, avail) : null;
  const outer = fixedWidth ?? avail;
  return {
    fixedWidth,
    clamped: requested > avail,
    innerWidth: Math.max(1, Math.floor(outer - boxInsets(box).horizontal)),
  };
}

const TABLE_ATTRS = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

/**
 * Wraps already-compiled `inner` HTML in the box's presentation table:
 *
 *   <table … width="W|100%" [align="center"] style="border-collapse:separate;…">
 *     <tr><td [bgcolor] [align] style="background-color;border-*;border-radius;padding;text-align">…</td></tr>
 *   </table>
 *
 * `border-collapse:separate` keeps `border-radius` working (Outlook
 * desktop ignores radius → square corners there). A fixed-width box
 * aligned right sits in a full-width wrapper cell instead of carrying
 * `align="right"` itself, which would float it next to the following
 * blocks.
 */
export function wrapInBox(inner: string, box: BoxStyle, layout: BoxLayout): string {
  if (isBoxEmpty(box)) return inner;
  const align = boxAlign(box);
  const width = layout.fixedWidth;
  const tableStyle = inlineStyle({
    'border-collapse': 'separate',
    'border-spacing': 0,
    width: width ? `${width}px` : '100%',
    margin: width && align === 'center' ? '0 auto' : undefined,
    'mso-table-lspace': '0pt',
    'mso-table-rspace': '0pt',
  });
  const tableAlign = width && align === 'center' ? ' align="center"' : '';
  const cellAlign = align !== 'left' ? ` align="${align}"` : '';
  const table =
    `<table ${TABLE_ATTRS} width="${width ?? '100%'}"${tableAlign} style="${tableStyle}">` +
    `<tr><td${bgcolorAttr(box.background_color)}${cellAlign} style="${inlineStyle(boxCellDeclarations(box))}">${inner}</td></tr></table>`;

  if (width && align === 'right') {
    return (
      `<table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse;width:100%;mso-table-lspace:0pt;mso-table-rspace:0pt">` +
      `<tr><td align="right" style="text-align:right">${table}</td></tr></table>`
    );
  }
  return table;
}
