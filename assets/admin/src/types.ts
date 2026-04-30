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
    /** Pattern that takes a `{id}` placeholder and routes to the iframe editor. */
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
  created_at: string;
}

/** REST: the storage state returned by /admin/storage. */
export interface StorageState {
  driver: string;
  available: string[];
  config: Record<string, string>;
  has_access_key: boolean;
  has_secret_key: boolean;
}
