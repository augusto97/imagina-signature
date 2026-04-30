import { getTranslations } from './translations';

/**
 * Translation helper. Returns the localised string when a translation
 * is loaded for `text`, otherwise `text` itself.
 *
 * `sprintf`-style `%s` placeholders are substituted in order.
 *
 * @example
 *   __('My Signatures');
 *   __('Created on %s', formattedDate);
 */
export function __(text: string, ...args: Array<string | number>): string {
  const translations = getTranslations();
  const localised = translations[text] ?? text;

  if (args.length === 0) return localised;

  let i = 0;
  return localised.replace(/%s/g, () => String(args[i++] ?? ''));
}
