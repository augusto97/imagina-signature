/**
 * Types shared between the editor app and its host (wp-admin).
 *
 * The host injects {@link AppConfig} as `window.IMGSIG_EDITOR_CONFIG`
 * before our bundle runs, so we read it synchronously at startup —
 * see `bridge/apiClient.ts`.
 */

/**
 * Editor bootstrap config — injected by `EditorAssetEnqueuer` PHP
 * as `window.IMGSIG_EDITOR_CONFIG` (CLAUDE.md §14.2).
 */
export interface AppConfig {
  /** ID of the signature being edited; 0 means "new". */
  signatureId: number;
  /** ID of the WordPress user who opened the editor. */
  userId: number;
  /** REST API base, e.g. `https://example.com/wp-json/imagina-signatures/v1`. */
  apiBase: string;
  /** WP REST nonce; sent as `X-WP-Nonce` on every request. */
  restNonce: string;
  /** WP locale code (e.g. `en_US`, `es_ES`). */
  locale: string;
  /** Plugin URL for static asset references. */
  pluginUrl: string;
  /** wp-admin URL of the signatures listing — used by the editor's back arrow. */
  signaturesUrl: string;
  /** Plugin caps held by the current user. */
  capabilities?: {
    use: boolean;
    manage_templates: boolean;
  };
}
