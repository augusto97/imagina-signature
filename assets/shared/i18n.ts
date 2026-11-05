/**
 * Runtime translation lookup shared by the editor and the admin app.
 *
 * PHP injects a flat `{ msgid: msgstr }` map as `translations` on the
 * page's bootstrap object (`IMGSIG_EDITOR_CONFIG` or
 * `IMGSIG_ADMIN_CONFIG`), built from
 * `languages/imagina-signatures-<locale>.json` (see
 * `src/Core/I18n.php`). English — or any locale without a catalogue —
 * gets an empty map and every string falls through to its msgid.
 *
 * Strings are extracted by `npm run i18n:pot`, which only sees LITERAL
 * first arguments: always write `__('Text')`, never `__(variable)`
 * (for registry-driven labels, list the values in a dynamic-strings
 * file instead — see `assets/editor/src/i18n/dynamic-strings.ts`).
 */

export type TranslationMap = Readonly<Record<string, string>>;

interface ConfigWithTranslations {
  translations?: unknown;
}

const EMPTY: TranslationMap = Object.freeze({});

/** The translation map of whichever app is mounted on this page. */
export function getTranslations(): TranslationMap {
  if (typeof window === 'undefined') return EMPTY;
  const w = window as unknown as {
    IMGSIG_EDITOR_CONFIG?: ConfigWithTranslations;
    IMGSIG_ADMIN_CONFIG?: ConfigWithTranslations;
  };
  const map = w.IMGSIG_EDITOR_CONFIG?.translations ?? w.IMGSIG_ADMIN_CONFIG?.translations;
  // PHP encodes an empty map as `[]` unless cast — accept only plain objects.
  return map && typeof map === 'object' && !Array.isArray(map) ? (map as TranslationMap) : EMPTY;
}

/**
 * Looks `text` up in `map`. Own, non-empty string values only — so
 * `__('constructor')` can never return a prototype member.
 */
export function translate(map: TranslationMap, text: string): string {
  if (Object.prototype.hasOwnProperty.call(map, text)) {
    const value = map[text];
    if (typeof value === 'string' && value !== '') return value;
  }
  return text;
}

/**
 * Minimal `sprintf`: `%s` (string), `%d` (integer), positional
 * `%1$s` / `%2$d`, and `%%` for a literal percent sign. Sequential
 * placeholders consume arguments in order independently of positional
 * ones, matching PHP / gettext semantics. A placeholder without a
 * matching argument renders as an empty string.
 */
export function sprintf(format: string, ...args: Array<string | number>): string {
  let next = 0;
  return format.replace(/%(?:(\d+)\$)?([sd%])/g, (match, position: string | undefined, conv: string) => {
    if (conv === '%') return position ? match : '%';
    const index = position ? Number(position) - 1 : next++;
    const value = index >= 0 && index < args.length ? args[index] : undefined;
    if (value === undefined || value === null) return '';
    if (conv === 'd') {
      const n = Number(value);
      return Number.isFinite(n) ? String(Math.trunc(n)) : '0';
    }
    return String(value);
  });
}

/**
 * Translation helper. Returns the translation of `text` for the
 * current user's locale (or `text` itself), with placeholders
 * substituted when arguments are given.
 *
 * Without arguments the string is returned verbatim — a literal `%`
 * in, say, `__('100% width')` needs no escaping.
 *
 * @example
 *   __('My Signatures');
 *   __('Created on %s', formattedDate);
 *   __('%1$s of %2$s', 3, 10);
 */
export function __(text: string, ...args: Array<string | number>): string {
  const localised = translate(getTranslations(), text);
  return args.length === 0 ? localised : sprintf(localised, ...args);
}
