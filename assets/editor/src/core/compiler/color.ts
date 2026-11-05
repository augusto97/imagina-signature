/**
 * Colour maths for the compiler's diagnostics and the preview's dark
 * mode simulation: parsing, WCAG relative luminance / contrast ratio,
 * alpha compositing and HSL lightness remapping.
 *
 * Pure functions, no DOM.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0–1. */
  a: number;
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  navy: '#000080',
  maroon: '#800000',
  orange: '#ffa500',
  purple: '#800080',
  teal: '#008080',
  yellow: '#ffff00',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  fuchsia: '#ff00ff',
};

/**
 * Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()`
 * (comma or space syntax, % channels) and the basic named colours.
 * `transparent` is `{0,0,0,0}`. Anything else → null.
 */
export function parseCssColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const v = value
    .replace(/\s*!\s*important\s*$/i, '')
    .trim()
    .toLowerCase();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED[v];
  if (named) return parseCssColor(named);

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    let h = hex[1]!;
    if (h.length <= 4) h = h.replace(/./g, (c) => c + c);
    const n = (i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }

  const fn = /^rgba?\(([^)]*)\)$/.exec(v);
  if (fn) {
    const parts = fn[1]!
      .replace('/', ' ')
      .split(/[\s,]+/)
      .filter((p) => p !== '');
    if (parts.length < 3) return null;
    const channel = (p: string): number | null => {
      const n = Number.parseFloat(p);
      if (!Number.isFinite(n)) return null;
      return clamp(p.endsWith('%') ? (n / 100) * 255 : n, 0, 255);
    };
    const r = channel(parts[0]!);
    const g = channel(parts[1]!);
    const b = channel(parts[2]!);
    if (r === null || g === null || b === null) return null;
    let a = 1;
    if (parts[3] !== undefined) {
      const n = Number.parseFloat(parts[3]);
      if (!Number.isFinite(n)) return null;
      a = clamp(parts[3].endsWith('%') ? n / 100 : n, 0, 1);
    }
    return { r, g, b, a };
  }
  return null;
}

/** First colour found in a `background` shorthand (`#fff url(x) no-repeat`). */
export function colorFromBackgroundShorthand(value: string): Rgba | null {
  const tokens = value.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|[a-z]+/gi) ?? [];
  for (const t of tokens) {
    const c = parseCssColor(t);
    if (c) return c;
  }
  return null;
}

/** `src` drawn over the opaque `dst`. */
export function composite(src: Rgba, dst: Rgba): Rgba {
  const a = src.a;
  return {
    r: src.r * a + dst.r * (1 - a),
    g: src.g * a + dst.g * (1 - a),
    b: src.b * a + dst.b * (1 - a),
    a: 1,
  };
}

/** WCAG 2.x relative luminance (0 = black, 1 = white). Alpha ignored. */
export function relativeLuminance(c: Rgba): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio between two opaque colours (1–21). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `#rrggbb` (alpha dropped). */
export function toHex(c: Rgba): string {
  const h = (v: number): string =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function rgbToHsl(c: Rgba): Hsl {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl, a = 1): Rgba {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255, a };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const hn = h / 360;
  return { r: hue(hn + 1 / 3) * 255, g: hue(hn) * 255, b: hue(hn - 1 / 3) * 255, a };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
