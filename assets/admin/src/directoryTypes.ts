/**
 * Types for the directory pages (My profile, Groups, CSV import) —
 * kept apart from `types.ts` so parallel work on the shared types
 * merges cleanly.
 */

import type { ProfileFieldAdminDefinition } from '@shared/profileFields';

/** REST: a group as /admin/groups returns it (1.3.0). */
export interface GroupRow {
  id: number;
  name: string;
  slug: string;
  description: string;
  color: string;
  template_id: number | null;
  compliance_footer_override: { enabled: boolean; html: string };
  member_count: number;
  /** Only on GET /admin/groups/{id} and the members PUT. */
  member_ids?: number[];
}

/** REST: a user as GET /admin/users returns it (1.3.0). */
export interface DirectoryUser {
  id: number;
  display_name: string;
  email: string;
  roles: string[];
  groups: Array<{ id: number; name: string; color: string }>;
  avatar: string;
  can_use: boolean;
}

/** REST: GET/PATCH /me/profile and /admin/users/{id}/profile (1.3.0). */
export interface ProfilePayload {
  user_id: number;
  user: { display_name: string; email: string; avatar: string };
  fields: Array<ProfileFieldAdminDefinition & { readonly: boolean }>;
  values: Record<string, string>;
  groups: Array<{ id: number; name: string; color: string }>;
  /** Only on PATCH. */
  saved?: { changed: string[]; ignored: string[] };
}

/** REST: one chunk's result from POST /admin/profiles/import (1.3.0). */
export interface ImportChunkResult {
  dry_run: boolean;
  rows: number;
  matched: number;
  created: number;
  unknown: string[];
  unknown_count: number;
  invalid: Array<{ row: number; message: string }>;
  users_changed: number;
  field_changes: number;
  group_assignments: number;
  groups_created: string[];
  groups_missing: string[];
  skipped_fields: string[];
}
