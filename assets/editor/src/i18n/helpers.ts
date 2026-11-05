/**
 * Editor translation helpers (CLAUDE.md §6.5).
 *
 * `__()` looks the msgid up in `IMGSIG_EDITOR_CONFIG.translations`
 * (injected by PHP for the user's locale), falls back to the msgid,
 * and substitutes `%s` / `%d` / positional `%1$s` placeholders.
 *
 * The implementation is shared with the admin app — see
 * `assets/shared/i18n.ts`.
 *
 * @example
 *   __('My Signatures');
 *   __('Created on %s', formattedDate);
 */
export { __, _n, sprintf } from '@shared/i18n';
