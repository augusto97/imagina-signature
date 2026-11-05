/**
 * Translation bundle accessor.
 *
 * The host PHP injects a `{ msgid: msgstr }` map as `translations` on
 * `IMGSIG_EDITOR_CONFIG` (`src/Core/I18n.php` reads it from
 * `languages/imagina-signatures-<locale>.json`, compiled from the .po
 * files by `npm run i18n:build`). Empty for English.
 */
export { getTranslations, type TranslationMap } from '@shared/i18n';
