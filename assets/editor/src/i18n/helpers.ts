// Minimal i18n helpers. The editor bundle wraps `@wordpress/i18n` here so
// tests can swap in pure-JS shims.

type WpI18n = {
  __: (text: string, domain?: string) => string;
  _n: (single: string, plural: string, n: number, domain?: string) => string;
  sprintf: (format: string, ...args: unknown[]) => string;
};

declare global {
  interface Window {
    wp?: { i18n?: WpI18n };
  }
}

const fallbackSprintf = (format: string, ...args: unknown[]): string => {
  let i = 0;
  return format.replace(/%[sd]/g, () => String(args[i++] ?? ''));
};

const i18n: WpI18n = (typeof window !== 'undefined' && window.wp?.i18n) ?? {
  __: (text) => text,
  _n: (single, plural, n) => (n === 1 ? single : plural),
  sprintf: fallbackSprintf,
};

export const __ = (text: string): string => i18n.__(text, 'imagina-signatures');
export const _n = (single: string, plural: string, n: number): string =>
  i18n._n(single, plural, n, 'imagina-signatures');
export const sprintf = (format: string, ...args: unknown[]): string =>
  i18n.sprintf(format, ...args);
