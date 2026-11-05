/**
 * Admin-app translation helper.
 *
 * `__()` looks the msgid up in `IMGSIG_ADMIN_CONFIG.translations`
 * (injected by PHP for the user's locale), falls back to the msgid,
 * and substitutes `%s` / `%d` / positional `%1$s` placeholders. Same
 * implementation as the editor's — see `assets/shared/i18n.ts`.
 */
export { __, _n, sprintf } from '@shared/i18n';
