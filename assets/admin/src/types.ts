/**
 * Types shared between the admin app and its host (wp-admin).
 */

/** Bootstrap config injected by PHP as `window.IMGSIG_ADMIN_CONFIG`. */
export interface AdminConfig {
  /** Initial page slug — selected by which wp-admin URL the user opened. */
  page: 'signatures' | 'templates' | 'settings';
  /** Logged-in user info. */
  userId: number;
  /** Map of plugin caps the user holds. */
  capabilities: {
    use: boolean;
    manage_templates: boolean;
    manage_storage: boolean;
  };
  /** REST API base, e.g. `https://example.com/wp-json/imagina-signatures/v1`. */
  apiBase: string;
  /** WP REST nonce. */
  restNonce: string;
  /** WP locale code. */
  locale: string;
  /** URL of the wp-admin home (so the breadcrumb back-link goes somewhere sensible). */
  wpAdminUrl: string;
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
