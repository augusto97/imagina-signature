import type { BorderSide, BoxBorderSideKey, BoxStyle, Padding } from './styles';

/**
 * Pure helpers for {@link BoxStyle} — shared by the compiler
 * (`core/compiler/box.ts`), the canvas (`BoxFrame`) and the property
 * panel (`BoxStyleSection`) so all three agree on what a box means.
 */

export type BoxSide = 'top' | 'right' | 'bottom' | 'left';

export const BOX_SIDES: readonly BoxSide[] = ['top', 'right', 'bottom', 'left'];

/** `top` → `border_top`. */
export function sideKey(side: BoxSide): BoxBorderSideKey {
  return `border_${side}` as BoxBorderSideKey;
}

/** Default border used when the user first enables one. */
export const DEFAULT_BOX_BORDER: BorderSide = { width: 1, style: 'solid', color: '#e5e7eb' };

/** A border side that actually draws something (width > 0). */
export function isVisibleBorder(side: BorderSide | null | undefined): side is BorderSide {
  return !!side && typeof side === 'object' && Number(side.width) > 0;
}

/**
 * Effective border per side: an explicit `border_<side>` wins over the
 * uniform `border` (a side with width 0 removes that edge). `null`
 * means no border on that side.
 */
export function resolveBorderSides(
  box: BoxStyle | null | undefined,
): Record<BoxSide, BorderSide | null> {
  const out: Record<BoxSide, BorderSide | null> = {
    top: null,
    right: null,
    bottom: null,
    left: null,
  };
  if (!box) return out;
  for (const side of BOX_SIDES) {
    const explicit = box[sideKey(side)];
    const effective = explicit !== undefined && explicit !== null ? explicit : box.border;
    out[side] = isVisibleBorder(effective) ? effective : null;
  }
  return out;
}

/** Whether any per-side border override is present. */
export function hasPerSideBorders(box: BoxStyle | null | undefined): boolean {
  return !!box && BOX_SIDES.some((side) => box[sideKey(side)] !== undefined);
}

function positive(n: unknown): number {
  const v = typeof n === 'number' ? n : Number.parseFloat(String(n ?? ''));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function hasPadding(p: Padding | null | undefined): boolean {
  return (
    !!p &&
    (positive(p.top) > 0 || positive(p.right) > 0 || positive(p.bottom) > 0 || positive(p.left) > 0)
  );
}

/**
 * Whether the box has nothing to render: no background, no visible
 * border, no radius, no padding, no fixed width and no alignment other
 * than the default (left).
 */
export function isBoxEmpty(box: BoxStyle | null | undefined): boolean {
  if (!box || typeof box !== 'object') return true;
  if (typeof box.background_color === 'string' && box.background_color.trim() !== '') return false;
  const sides = resolveBorderSides(box);
  if (BOX_SIDES.some((s) => sides[s] !== null)) return false;
  if (positive(box.border_radius) > 0) return false;
  if (hasPadding(box.padding)) return false;
  if (positive(box.width) > 0) return false;
  if (box.align === 'center' || box.align === 'right') return false;
  return true;
}

/**
 * Drops unset fields (`undefined`, `null`, `''`) and returns
 * `undefined` when no field is left — what the property panel writes
 * back so the schema never accumulates `box: {}` noise. Fields that are
 * set but currently render nothing (a 0px border the user is still
 * typing) are kept on purpose; the renderers use {@link isBoxEmpty}.
 */
export function compactBox(box: BoxStyle | null | undefined): BoxStyle | undefined {
  if (!box || typeof box !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(box)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? (out as BoxStyle) : undefined;
}

/**
 * Horizontal / vertical px a box consumes around its content (inner
 * padding + border widths). The compiler subtracts `horizontal` from
 * the width available to the boxed block.
 */
export function boxInsets(box: BoxStyle | null | undefined): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  horizontal: number;
} {
  const sides = resolveBorderSides(box);
  const p = box?.padding;
  const clampPad = (v: unknown): number => Math.min(400, positive(v));
  const clampBorder = (s: BorderSide | null): number => (s ? Math.min(50, positive(s.width)) : 0);
  const left = clampPad(p?.left) + clampBorder(sides.left);
  const right = clampPad(p?.right) + clampBorder(sides.right);
  const top = clampPad(p?.top) + clampBorder(sides.top);
  const bottom = clampPad(p?.bottom) + clampBorder(sides.bottom);
  return { left, right, top, bottom, horizontal: left + right };
}
