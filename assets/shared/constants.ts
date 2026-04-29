// Shared constants between editor and admin bundles.

export const TEXT_DOMAIN = 'imagina-signatures';
export const SCHEMA_VERSION = '1.0' as const;
export const DEFAULT_FONT_FAMILY = 'Arial, Helvetica, sans-serif';
export const MAX_HTML_SIZE_BYTES = 102 * 1024;

export const SAFE_FONT_FAMILIES = [
  'Arial, Helvetica, sans-serif',
  'Georgia, serif',
  'Tahoma, Verdana, sans-serif',
  'Times New Roman, serif',
  'Courier New, monospace',
  'Trebuchet MS, sans-serif',
] as const;

export const CANVAS_DEFAULTS = {
  width: 600,
  background_color: '#ffffff',
  font_family: DEFAULT_FONT_FAMILY,
  font_size: 13,
  text_color: '#333333',
  link_color: '#1a73e8',
} as const;
