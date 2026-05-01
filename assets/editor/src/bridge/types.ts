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
  /**
   * Read-only `wp_*` variables auto-populated from the current
   * WP user record (display_name, email, first_name, last_name,
   * url) plus any extras a host plugin added via the
   * `imgsig/editor/system_variables` filter. Surfaced in the
   * Variables editor as immutable rows; merged into the substitution
   * pass at compile time (user-defined variables win on conflict).
   */
  systemVariables?: Record<string, string>;
  /**
   * Site-wide brand colour swatches, shown in every ColorInput as
   * quick-pick buttons. Configured in admin Settings.
   */
  brandPalette?: string[];
  /**
   * Site-wide compliance footer (GDPR / CAN-SPAM disclaimer) appended
   * at the bottom of every compiled signature when `enabled` is true.
   */
  complianceFooter?: {
    enabled: boolean;
    html: string;
  };
  /**
   * Currently-active banner campaigns the compile pipeline can rotate
   * between. Already filtered by the server (enabled + within date
   * window). Empty array = no campaign banner is injected.
   */
  bannerCampaigns?: BannerCampaign[];
}

export interface BannerCampaign {
  id: string;
  name: string;
  enabled: boolean;
  image_url: string;
  link_url: string;
  alt: string;
  width: number;
  start_date: string;
  end_date: string;
}
