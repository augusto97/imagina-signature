/**
 * Normalises `#rgb` / `#rrggbb` / opaque `rgb(r, g, b)` to lower-case
 * `#rrggbb` — Tiptap's colour mark reads colours back as `rgb()`, while
 * swatches are hex. Anything else yields `null`.
 */
export function toHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return `#${m[1]!.replace(/./g, (c) => c + c)}`;
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) return v;
  const rgb =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:1|1\.0+)\s*)?\)$/.exec(v);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((c) => Math.min(255, Number(c)).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  return null;
}
