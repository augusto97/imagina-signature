import type { ButtonPreset } from '@/core/schema/blocks';
import type { Padding, TextAlign, TextStyle } from '@/core/schema/styles';
import type { CompileContext } from '@/core/blocks/registry';
import {
  attr,
  bgcolorAttr,
  escapeHtml,
  horizontalPadding,
  inlineStyle,
  paddingCss,
  parseColor,
  px,
  safeColor,
} from '@/core/compiler/css';
import { markerAttr, report, type BlockRef } from '@/core/compiler/issues';
import { __ } from '@/i18n/helpers';
import { alignedRow, alignMargin, blockAlign, tableAlignAttr } from '../text/blockLayout';
import {
  BUTTON_TYPOGRAPHY,
  resolveTypography,
  type CanvasTypography,
  type ResolvedTypography,
  type TypographyDefaults,
} from '../text/typography';

/**
 * Bullet-proof button markup, shared by the Button block and the
 * vCard block's "button" style.
 *
 * Outlook desktop (Word's render engine — no border-radius, no padding
 * on <a>) gets a VML `<v:roundrect>` sized from the label; every other
 * client ignores that conditional and renders the table-cell button:
 * fill, border, radius and padding sit on a `<td bgcolor>`, so it still
 * looks like a button where inline-block / padding on <a> are dropped.
 * The `text` preset is a plain styled link (no VML needed).
 * Reference: https://www.caniemail.com (round buttons in Outlook).
 */

/** Everything a button needs, with schema values already validated. */
export interface ButtonSpec {
  label: string;
  href: string;
  preset: ButtonPreset;
  /** Fill colour; `null` = no fill (outline / text). */
  fill: string | null;
  textColor: string;
  /** Corner radius in px (`pill` → 999). */
  radius: number;
  paddingX: number;
  paddingY: number;
  borderWidth: number;
  borderColor: string | null;
  fullWidth: boolean;
  align: TextAlign;
  typography: ResolvedTypography;
  /** Label line height in px. */
  lineHeight: number;
  /** Outer (block) padding. */
  padding: Padding | undefined;
}

/** Raw (schema) inputs of {@link resolveButtonSpec}. */
export interface ButtonFields {
  label: string;
  href: string;
  preset?: ButtonPreset;
  background_color: string;
  text_color: string;
  border_radius: number;
  padding_x?: number;
  padding_y?: number;
  border_width?: number;
  border_color?: string;
  full_width?: boolean;
  align?: TextAlign;
  style?: TextStyle;
  padding?: Padding;
}

export interface ButtonDefaults {
  paddingX: number;
  paddingY: number;
  fill: string;
  text: string;
  typography: TypographyDefaults;
}

/** v1 look: 12 × 24 px padding, 14px semibold label, 16px line height. */
export const BUTTON_DEFAULTS: ButtonDefaults = {
  paddingX: 24,
  paddingY: 12,
  fill: '#1d4ed8',
  text: '#ffffff',
  typography: BUTTON_TYPOGRAPHY,
};

const PRESETS: ReadonlySet<ButtonPreset> = new Set(['solid', 'outline', 'pill', 'text']);

export function buttonPreset(value: unknown): ButtonPreset {
  return PRESETS.has(value as ButtonPreset) ? (value as ButtonPreset) : 'solid';
}

/** Validates the schema fields and applies the preset rules. */
export function resolveButtonSpec(
  fields: ButtonFields,
  canvas: Partial<CanvasTypography> | null | undefined,
  defaults: ButtonDefaults = BUTTON_DEFAULTS,
): ButtonSpec {
  const preset = buttonPreset(fields.preset);
  const typography = resolveTypography(fields.style, canvas, defaults.typography);
  const background = safeColor(fields.background_color, defaults.fill);
  const isText = preset === 'text';
  const isOutline = preset === 'outline';

  let borderWidth = isText ? 0 : px(fields.border_width, 0, 8, 0);
  if (isOutline) borderWidth = Math.max(1, px(fields.border_width, 0, 8, 2));
  const borderColor = borderWidth > 0 ? safeColor(fields.border_color, background) : null;

  return {
    label: String(fields.label ?? ''),
    href: String(fields.href ?? ''),
    preset,
    fill: isText || isOutline ? null : background,
    textColor: safeColor(fields.text_color, isText || isOutline ? background : defaults.text),
    radius: isText ? 0 : preset === 'pill' ? 999 : px(fields.border_radius, 0, 999, 0),
    paddingX: isText ? 0 : px(fields.padding_x, 0, 64, defaults.paddingX),
    paddingY: isText ? 0 : px(fields.padding_y, 0, 40, defaults.paddingY),
    borderWidth,
    borderColor,
    fullWidth: !isText && fields.full_width === true,
    align: blockAlign(fields.align),
    typography,
    lineHeight: Math.round(typography.fontSize * typography.lineHeight),
    padding: fields.padding,
  };
}

/**
 * Label colour to switch to when changing between a filled look
 * (solid / pill) and a fill-less one (outline / text link), or
 * `undefined` when the current one stays readable: a white label
 * without a fill takes the button colour; a label equal to the fill
 * turns white.
 */
export function readableTextColor(
  fields: Pick<ButtonFields, 'text_color' | 'background_color'>,
  filled: boolean,
): string | undefined {
  const text = parseColor(fields.text_color);
  const fill = parseColor(fields.background_color);
  if (filled) return text && fill && text === fill ? '#ffffff' : undefined;
  return !text || isLight(text) ? fields.background_color : undefined;
}

function isLight(color: string): boolean {
  if (color === 'white') return true;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return false;
  let h = m[1]!;
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 200;
}

/** Outer height of the button in px (label line + padding + border). */
export function buttonHeight(spec: ButtonSpec): number {
  return spec.lineHeight + spec.paddingY * 2 + spec.borderWidth * 2;
}

export interface VmlMetrics {
  fontSize: number;
  paddingX: number;
  borderWidth: number;
  letterSpacing: number;
  uppercase: boolean;
  fontWeight: number;
  minWidth: number;
}

const DEFAULT_METRICS: VmlMetrics = {
  fontSize: 14,
  paddingX: 24,
  borderWidth: 0,
  letterSpacing: 0,
  uppercase: false,
  fontWeight: 600,
  minWidth: 120,
};

/** ≈ average advance of semibold Arial, in em (8.5px at 14px). */
const CHAR_EM = 8.5 / 14;

/**
 * Pixel width the VML button needs for `label`: estimated label width
 * (chars × average advance, adjusted for case, weight and tracking) +
 * horizontal padding + border, never below `minWidth` (120), so long
 * labels don't clip in Outlook. Defaults reproduce the v1 sizing
 * (chars × 8.5 + 48).
 */
export function vmlButtonWidth(label: string, metrics: Partial<VmlMetrics> = {}): number {
  const m = { ...DEFAULT_METRICS, ...metrics };
  const chars = Array.from(label).length;
  let advance = m.fontSize * CHAR_EM;
  if (m.uppercase) advance *= 1.2;
  if (m.fontWeight < 600) advance *= 0.95;
  advance += m.letterSpacing;
  return Math.max(m.minWidth, Math.round(chars * advance + m.paddingX * 2 + m.borderWidth * 2));
}

/** Label typography as inline declarations (colour supplied separately). */
function labelDeclarations(spec: ButtonSpec, color: string): Record<string, string | undefined> {
  const t = spec.typography;
  return {
    color,
    'font-family': t.fontFamily,
    'font-size': `${t.fontSize}px`,
    'font-weight': t.fontWeight,
    'font-style': t.fontStyle ?? undefined,
    'letter-spacing': t.letterSpacing !== null ? `${t.letterSpacing}px` : undefined,
    'text-transform': t.textTransform ?? undefined,
  };
}

/**
 * Compiles a button to email HTML. `block` names the owning block (URL
 * diagnostics marker + issues).
 */
export function compileButton(spec: ButtonSpec, block: BlockRef, ctx: CompileContext): string {
  const marker = markerAttr(block);
  const safeLabel = escapeHtml(spec.label);
  const safeHref = attr(spec.href);
  const padding = paddingCss(spec.padding);

  if (spec.preset === 'text') {
    const linkStyle = inlineStyle({
      ...labelDeclarations(spec, spec.textColor),
      'line-height': `${spec.lineHeight}px`,
      'text-decoration': 'underline',
    });
    return alignedRow(
      `<a${marker} href="${safeHref}" style="${linkStyle}">${safeLabel}</a>`,
      spec.align,
      padding,
    );
  }

  const height = buttonHeight(spec);
  const available = Math.max(40, Math.floor(ctx.availableWidth - horizontalPadding(spec.padding)));

  // Size the VML shape from the label as the recipient will see it
  // (variables resolved), capped to the width available here.
  const resolvedLabel = spec.label.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (m, name: string) => ctx.variables[name] ?? m,
  );
  let vmlWidth: number;
  if (spec.fullWidth) {
    vmlWidth = available;
  } else {
    const wanted = vmlButtonWidth(resolvedLabel, {
      fontSize: spec.typography.fontSize,
      paddingX: spec.paddingX,
      borderWidth: spec.borderWidth,
      letterSpacing: spec.typography.letterSpacing ?? 0,
      uppercase: spec.typography.textTransform === 'uppercase',
      fontWeight: Number.parseInt(spec.typography.fontWeight, 10) || 400,
      minWidth: Math.min(120, available),
    });
    if (wanted > available) {
      report(
        ctx,
        'warning',
        __(
          'Button label is too long to fit on one line in Outlook; shorten it or it may be cut off.',
        ),
        block,
        'button-too-wide',
      );
    }
    vmlWidth = Math.min(wanted, available);
  }
  const arcsize = Math.min(50, Math.round((spec.radius / height) * 100));

  const vmlFill = spec.fill ? `fillcolor="${spec.fill}"` : 'filled="f"';
  const vmlStroke =
    spec.borderWidth > 0 && spec.borderColor
      ? `strokecolor="${spec.borderColor}" strokeweight="${spec.borderWidth}px"`
      : 'stroke="f"';
  const centerStyle = inlineStyle(labelDeclarations(spec, spec.textColor));
  const vmlButton = `<!--[if mso]>
<v:roundrect${marker} xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:${height}px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="${arcsize}%" ${vmlStroke} ${vmlFill}>
<w:anchorlock/>
<center style="${centerStyle}">${safeLabel}</center>
</v:roundrect>
<![endif]-->`;

  const cellStyle = inlineStyle({
    'background-color': spec.fill ?? undefined,
    'border-radius': `${spec.radius}px`,
    padding: `${spec.paddingY}px ${spec.paddingX}px`,
    border:
      spec.borderWidth > 0 && spec.borderColor
        ? `${spec.borderWidth}px solid ${spec.borderColor}`
        : undefined,
    'text-align': spec.fullWidth ? 'center' : undefined,
  });
  const linkStyle = inlineStyle({
    display: 'inline-block',
    ...labelDeclarations(spec, spec.textColor),
    'text-decoration': 'none',
    'line-height': `${spec.lineHeight}px`,
  });
  const tableAttrs = spec.fullWidth ? ' width="100%"' : tableAlignAttr(spec.align);
  const tableStyle = inlineStyle({
    'border-collapse': 'separate',
    width: spec.fullWidth ? '100%' : undefined,
    margin: spec.fullWidth ? undefined : alignMargin(spec.align),
  });
  const cellAlign = spec.fullWidth ? ' align="center"' : '';
  const cellButton = `<!--[if !mso]><!-- --><table role="presentation" cellpadding="0" cellspacing="0" border="0"${tableAttrs} style="${tableStyle}"><tr><td${cellAlign}${spec.fill ? bgcolorAttr(spec.fill) : ''} style="${cellStyle}"><a${marker} href="${safeHref}" style="${linkStyle}">${safeLabel}</a></td></tr></table><!--<![endif]-->`;

  return alignedRow(`${vmlButton}${cellButton}`, spec.align, padding);
}
