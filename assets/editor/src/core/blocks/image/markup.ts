import { attr, inlineStyle, type StyleDeclarations } from '@/core/compiler/css';
import type { ImageAlign } from './model';

/**
 * Email markup shared by the Image, Avatar and Banner compilers.
 * Every interpolated value goes through `core/compiler/css.ts`.
 */

/**
 * Margin that pushes a `display:block` image to its alignment in
 * clients that ignore the cell's legacy `align` (Outlook uses `align`,
 * everything else honours either).
 */
export function alignMargin(align: ImageAlign): string | undefined {
  if (align === 'center') return '0 auto';
  if (align === 'right') return '0 0 0 auto';
  return undefined;
}

/** Inline style of an email `<img>` (border:0 unless a border is given). */
export function imageStyle(extra: StyleDeclarations = {}, align: ImageAlign = 'left'): string {
  return inlineStyle({
    display: 'block',
    border: 0,
    outline: 'none',
    'text-decoration': 'none',
    'max-width': '100%',
    height: 'auto',
    margin: alignMargin(align),
    ...extra,
  });
}

/**
 * Full-width presentation table whose single cell aligns `inner`
 * (`align` attribute for Outlook + `text-align` for everyone else).
 */
export function alignedBlockTable(
  inner: string,
  options: { padding: string; align: ImageAlign },
): string {
  const td = inlineStyle({ padding: options.padding, 'text-align': options.align });
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">' +
    `<tr><td align="${attr(options.align)}" style="${td}">${inner}</td></tr></table>`
  );
}

/**
 * Builds the `<img>` (optionally wrapped in `<a>`) with an Outlook
 * 2007–2019 fallback when `fallback` is set. Pattern:
 *
 *   <!--[if !mso]><!--><img src=ANIMATED ...><!--<![endif]-->
 *   <!--[if mso]><img src=STATIC ...><![endif]-->
 *
 * Modern clients ignore the conditional comments and render the
 * first `<img>`; Outlook desktop only renders what's inside
 * `[if mso]` so it gets the static frame.
 *
 * `styles` must already be attribute-safe ({@link imageStyle} /
 * `inlineStyle()` output).
 */
export function withOutlookFallback(
  src: string,
  fallback: string | undefined,
  alt: string,
  dimAttrs: string,
  styles: string,
  link: string | undefined,
  marker = '',
): string {
  // Strict attribute-context escaping via the central serializer —
  // user-controlled URLs / alt text must never break out of the
  // attribute and inject HTML.
  const safeSrc = attr(src);
  const safeAlt = attr(alt);
  const safeLink = link ? attr(link) : '';
  const wrap = (img: string): string => (link ? `<a${marker} href="${safeLink}">${img}</a>` : img);

  if (!fallback) {
    const img = `<img${marker} src="${safeSrc}" alt="${safeAlt}"${dimAttrs} style="${styles}" />`;
    return wrap(img);
  }

  const safeFallback = attr(fallback);
  const animated = `<img${marker} src="${safeSrc}" alt="${safeAlt}"${dimAttrs} style="${styles}" />`;
  const staticImg = `<img${marker} src="${safeFallback}" alt="${safeAlt}"${dimAttrs} style="${styles}" />`;
  return (
    `<!--[if !mso]><!-->${wrap(animated)}<!--<![endif]-->` +
    `<!--[if mso]>${wrap(staticImg)}<![endif]-->`
  );
}

/** ` width="W" height="H"` (each only when > 0). */
export function dimensionAttrs(width: number, height: number): string {
  return `${width > 0 ? ` width="${Math.round(width)}"` : ''}${height > 0 ? ` height="${Math.round(height)}"` : ''}`;
}
