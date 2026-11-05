/**
 * REST shapes of the team console (1.3.0) — `GET /admin/team` and the
 * recompile endpoints under `/admin/signatures/`.
 */

import type { ProfileFieldDefinition } from '@shared/profileFields';
import type { BannerCampaign } from '@admin/types';

export type HtmlState = 'none' | 'outdated' | 'fresh';
export type GmailState = 'not_configured' | 'never' | 'pushed' | 'outdated' | 'failed' | 'skipped';
export type OutlookState = 'not_configured' | 'never' | 'delivered' | 'outdated';
export type InstallState = 'none' | 'invited' | 'opened' | 'installed' | 'outdated';

/** `state` filter of `GET /admin/team`. */
export type TeamStateFilter =
  | 'all'
  | 'no_signature'
  | 'outdated'
  | 'up_to_date'
  | 'gmail_failed'
  | 'not_installed'
  | 'install_outdated';

export interface TeamPrimary {
  id: number;
  name: string;
  status: 'draft' | 'ready' | 'archived';
  template_id: number | null;
  template_name?: string;
  link: 'linked' | 'copy' | 'none';
  updated_at: string;
  compiled_at: string | null;
  /** Chosen with "Make primary" (else the most recently updated). */
  marked: boolean;
}

/** One row of `GET /admin/team`. */
export interface TeamRow {
  id: number;
  display_name: string;
  email: string;
  roles: string[];
  groups: Array<{ id: number; name: string; color: string }>;
  avatar: string;
  can_use: boolean;
  signature_count: number;
  primary: TeamPrimary | null;
  html: { state: HtmlState; compiled_at: string | null };
  gmail: { state: GmailState; at: string | null; message: string };
  outlook: { state: OutlookState; at: string | null };
  install: {
    state: InstallState;
    invited_at: string | null;
    opened_at: string | null;
    installed_at: string | null;
    client: string | null;
    reminders: number;
  };
}

export interface TeamSummary {
  users: number;
  with_signature: number;
  without_signature: number;
  outdated_html: number;
  gmail_pushed: number;
  gmail_failed: number;
  outlook_delivered: number;
  installed: number;
  install_outdated: number;
  not_installed: number;
  /** Non-archived signatures (of anyone) whose HTML awaits a recompile. */
  stale_signatures: number;
}

export interface TeamChannels {
  gmail: { configured: boolean; auto_push: boolean };
  outlook: { enabled: boolean };
}

/** `GET /admin/team`. */
export interface TeamResponse {
  items: TeamRow[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  summary: TeamSummary;
  channels: TeamChannels;
}

/** One row of `GET /admin/signatures/stale`. */
export interface StaleSignature {
  id: number;
  user_id: number;
  name: string;
  template_id: number | null;
  link_mode: 'linked' | 'detached';
  status: string;
  updated_at: string;
  compiled_at: string | null;
}

/** `GET /admin/signatures/:id/render-context` — everything the owner's editor would compile with. */
export interface RenderContext {
  id: number;
  user_id: number;
  name: string;
  template_id: number | null;
  link_mode: string;
  updated_at: string;
  compiled_at: string | null;
  /** The owner's locale (`lang` / `dir` of the output). */
  locale: string;
  json_content: unknown;
  systemVariables: Record<string, string>;
  complianceFooter: { enabled: boolean; html: string };
  bannerCampaigns: BannerCampaign[];
  profileFields?: ProfileFieldDefinition[];
  pluginUrl?: string;
  /** Fingerprint of the owner's inputs — sent back as `expected_inputs_hash`. */
  inputs_hash?: string;
}
