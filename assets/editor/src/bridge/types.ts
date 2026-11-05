/**
 * Types shared between the editor app and its host (wp-admin).
 *
 * The host injects {@link AppConfig} as `window.IMGSIG_EDITOR_CONFIG`
 * before our bundle runs, so we read it synchronously at startup —
 * see `bridge/apiClient.ts`.
 */

import type { BrandKit } from '@shared/brandKit';
import type { ProfileFieldDefinition } from '@shared/profileFields';

/**
 * Editor bootstrap config — injected by `EditorAssetEnqueuer` PHP
 * as `window.IMGSIG_EDITOR_CONFIG` (CLAUDE.md §14.2).
 */
export interface AppConfig {
  /**
   * Plugin version sourced from `IMGSIG_VERSION` in the PHP main file.
   * The bundle bakes its compile-time version into `__BUNDLE_VERSION__`
   * and compares against this at runtime — mismatch means the user's
   * browser is serving a cached editor.js while the plugin itself has
   * been upgraded, and we surface that as a "hard-refresh required"
   * banner so they don't keep wondering why fixes aren't landing.
   */
  pluginVersion: string;
  /** ID of the signature being edited; 0 means "new". */
  signatureId: number;
  /** ID of the WordPress user who opened the editor. */
  userId: number;
  /** REST API base, e.g. `https://example.com/wp-json/imagina-signatures/v1`. */
  apiBase: string;
  /**
   * WP REST nonce; sent as `X-WP-Nonce` on every request. Mutable:
   * the API client refreshes it in place when it expires.
   */
  restNonce: string;
  /**
   * Absolute URL of `wp-admin/admin-ajax.php`, used to fetch a fresh
   * REST nonce (`?action=rest-nonce`). Optional for back-compat; the
   * client falls back to `${location.origin}/wp-admin/admin-ajax.php`.
   */
  ajaxUrl?: string;
  /** WP locale code of the editor UI (e.g. `en_US`, `es_ES`). */
  locale: string;
  /**
   * Locale of the signature's OWNER (1.3.0): the `lang` / `dir` of the
   * compiled output. Differs from {@link locale} when a team manager
   * edits someone else's signature. Missing = {@link locale}.
   */
  signatureLocale?: string;
  /**
   * Set when a team manager is editing another user's signature on
   * their behalf (1.3.0): the system variables, footer and campaigns in
   * this config are the owner's. Missing / null = the user's own.
   */
  onBehalfOf?: OnBehalfOf | null;
  /**
   * `{ msgid: msgstr }` for the user's locale (empty for English).
   * Read by `__()` — see `assets/shared/i18n.ts`.
   */
  translations?: Record<string, string>;
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
   * Whether file uploads are allowed on this site. False when the
   * admin selected URL-only storage mode (1.0.29) — the editor
   * hides the cropper, the image picker, and any "upload" affordance,
   * leaving only URL inputs. Default true for back-compat: missing
   * field = uploads allowed (legacy bootstrap that pre-dates
   * url_only mode).
   */
  uploadEnabled?: boolean;
  /**
   * Read-only variables: `wp_*` auto-populated from the current WP
   * user record (display_name, email, first_name, last_name, url),
   * `company_*` from the site-wide brand kit (always present, '' when
   * blank), plus any extras a host plugin added via the
   * `imgsig/editor/system_variables` filter. Surfaced in the
   * Variables editor as immutable rows; merged into the substitution
   * pass at compile time and on the canvas in "Show data" mode
   * (user-defined variables win on conflict).
   */
  systemVariables?: Record<string, string>;
  /**
   * Profile fields (1.3.0): the canonical keys plus the admin's custom
   * fields, with labels. Their values are in `systemVariables`, and a
   * NON-EMPTY one wins over the signature's own variable of the same
   * name (see `resolvedVariables()`).
   */
  profileFields?: ProfileFieldDefinition[];
  /**
   * Where the user edits their profile (wp-admin page or public route) —
   * linked from the read-only profile values in the Variables panel and
   * the "Your details" form.
   */
  profileUrl?: string;
  /**
   * Public company brand kit (Settings → Brand kit). New signatures
   * start from its typography. Optional for back-compat.
   */
  brandKit?: BrandKit;
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
  /**
   * Whether the signature follows a company template (1.3.0) and what
   * the template's employee mode lets this user change. Missing =
   * a detached signature in `free` mode (pre-1.3 bootstrap).
   */
  signatureLink?: SignatureLinkConfig;
  /**
   * True for template / team managers: they ignore block locks and
   * employee modes (1.3.0). Missing = false.
   */
  canBypassLocks?: boolean;
}

/** `IMGSIG_EDITOR_CONFIG.onBehalfOf` (1.3.0). */
export interface OnBehalfOf {
  userId: number;
  displayName: string;
  email: string;
}

/** `IMGSIG_EDITOR_CONFIG.signatureLink` (1.3.0). */
export interface SignatureLinkConfig {
  mode: 'linked' | 'detached';
  templateId: number | null;
  employeeMode: 'free' | 'locked_design' | 'fields_only';
  /** Display name of the template ('' when unknown). */
  templateName?: string;
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
