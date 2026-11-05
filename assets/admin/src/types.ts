/**
 * Types shared between the admin app and its host (wp-admin).
 */

import type { BrandKit } from '@shared/brandKit';

/** Bootstrap config injected by PHP as `window.IMGSIG_ADMIN_CONFIG`. */
export interface AdminConfig {
  /** Initial page slug — selected by which wp-admin URL the user opened. */
  page: 'signatures' | 'templates' | 'settings' | 'profile' | 'groups';
  /** Logged-in user info. */
  userId: number;
  /** Map of plugin caps the user holds. */
  capabilities: {
    use: boolean;
    manage_templates: boolean;
    manage_storage: boolean;
    /** `imgsig_manage_team` (1.3.0; missing on older bootstraps): groups, profile fields, CSV import, other users, deployment. */
    manage_team?: boolean;
  };
  /** REST API base, e.g. `https://example.com/wp-json/imagina-signatures/v1`. */
  apiBase: string;
  /** WP REST nonce. Mutable: the API client refreshes it in place when it expires. */
  restNonce: string;
  /**
   * Absolute URL of `wp-admin/admin-ajax.php`, used to fetch a fresh
   * REST nonce (`?action=rest-nonce`). Optional for back-compat; the
   * client falls back to `${location.origin}/wp-admin/admin-ajax.php`.
   */
  ajaxUrl?: string;
  /** WP locale code. */
  locale: string;
  /**
   * `{ msgid: msgstr }` for the user's locale (empty for English).
   * Read by `__()` — see `assets/shared/i18n.ts`.
   */
  translations?: Record<string, string>;
  /** URL of the wp-admin home (so the breadcrumb back-link goes somewhere sensible). */
  wpAdminUrl: string;
  /**
   * Where the React app is being hosted. `admin` = wp-admin (default),
   * `public` = the FrontendRouter `/signatures/` route. The sidebar's
   * back-link uses this to swap "Back to WP Admin" for "Back to home"
   * — non-admin subscribers don't have wp-admin access, so a wp-admin
   * link in their footer is dead weight at best, a 403 wall at worst.
   */
  frontendContext?: 'admin' | 'public';
  /**
   * False when the site runs the URL-only storage driver: upload
   * buttons (Brand kit logo) are hidden. Missing = uploads allowed.
   */
  uploadEnabled?: boolean;
  /** URL templates for navigation between admin pages and the editor. */
  urls: {
    signatures: string;
    templates: string;
    settings: string;
    /**
     * Pattern that takes an `__ID__` placeholder and routes to the
     * editor. Fill via `.replace('__ID__', String(id))`. The
     * placeholder is alphanumeric so `esc_url_raw` on the PHP side
     * leaves it intact — the original `{id}` template lost its
     * braces and broke every Edit link in the listing.
     */
    editor: string;
    /** "My profile" (1.3.0; wp-admin page or `/<slug>/?view=profile`). */
    profile?: string;
    /** Groups + CSV import (1.3.0; wp-admin only). */
    groups?: string;
  };
}

/** REST: the signature row shape returned by /signatures. */
export interface SignatureRow {
  id: number;
  user_id: number;
  name: string;
  json_content: unknown;
  html_cache: string | null;
  preview_url: string | null;
  template_id: number | null;
  status: 'draft' | 'ready' | 'archived';
  schema_version: string;
  /** The one deployed to Gmail / Outlook / install links (1.3.0). */
  is_primary?: boolean;
  /** UTC time the server copy of the HTML was compiled (1.3.0). */
  compiled_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** REST: the template row shape returned by /templates. */
export interface TemplateRow {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  preview_url: string | null;
  json_content: unknown;
  is_system: boolean;
  sort_order: number;
  schema_version: string;
  /** Role slugs this template is visible to. Empty = visible to everyone. */
  visible_to_roles: string[];
  created_at: string;
}

/** REST: the response from POST /admin/templates/:id/apply. */
export interface BulkApplyResult {
  template_id: number;
  scope: string;
  targeted: number;
  created: number;
  skipped: number;
  failed: number;
}

/** REST: the storage state returned by /admin/storage. */
export interface StorageState {
  driver: string;
  available: string[];
  config: Record<string, string>;
  has_access_key: boolean;
  has_secret_key: boolean;
}

/** REST: the bundle returned by /admin/site-settings. */
export interface SiteSettings {
  brand_palette: string[];
  compliance_footer: { enabled: boolean; html: string };
  banner_campaigns: BannerCampaign[];
  /** Company brand kit (1.2.0+; may be missing on an older server). */
  brand_kit?: BrandKit;
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
  /** Group (term) ids the campaign targets; empty / missing = everyone (1.3.0). */
  groups?: number[];
}

/** REST: GET/PATCH /admin/frontend-access. */
export interface FrontendAccess {
  enabled: boolean;
  slug: string;
  roles: string[];
  available_roles: { slug: string; label: string }[];
  dashboard_url: string;
}
