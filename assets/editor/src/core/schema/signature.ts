import type { Block } from './blocks';

/**
 * Top-level signature schema (CLAUDE.md §8.1).
 *
 * Every signature persisted in `imgsig_signatures.json_content` round-
 * trips through this shape. `schema_version` is checked on load and
 * controls the migration path when newer versions ship.
 */

/**
 * Schema versions the editor can read. `1.0` rows are migrated to the
 * current version on load (see `core/schema/migrate.ts`); everything
 * the editor writes is {@link CURRENT_SCHEMA_VERSION}.
 *
 *  - 1.0 — containers: `columns: 1 | 2`, `children`, `right_children`.
 *  - 1.1 — `block.box` styling; containers hold `columns: ContainerColumn[]`.
 */
export type SchemaVersion = '1.0' | '1.1';

/** Version stamped on new and migrated signatures. */
export const CURRENT_SCHEMA_VERSION = '1.1' satisfies SchemaVersion;

export interface SignatureMeta {
  /** ISO 8601 UTC. */
  created_at: string;
  /** ISO 8601 UTC. */
  updated_at: string;
  editor_version: string;
}

export interface CanvasConfig {
  /** Pixel width of the canvas, 320–800; default 600. */
  width: number;
  background_color: string;
  font_family: string;
  font_size: number;
  text_color: string;
  link_color: string;
}

/**
 * What employees may change on a signature that follows a template
 * (1.3.0), declared by the template in `settings.employee_mode`:
 *
 *  - `free`          everything (default; the pre-1.3 behaviour);
 *  - `locked_design` only the text of unlocked text / heading /
 *                    disclaimer blocks — layout, styles and locked
 *                    blocks are fixed;
 *  - `fields_only`   only their own details (variables / profile).
 */
export type EmployeeMode = 'free' | 'locked_design' | 'fields_only';

/** Every {@link EmployeeMode}. */
export const EMPLOYEE_MODES: readonly EmployeeMode[] = ['free', 'locked_design', 'fields_only'];

/** Template-level settings (1.3.0). Copied into the signatures built from it. */
export interface SignatureSettings {
  employee_mode?: EmployeeMode;
}

/**
 * An employee's own text on an unlocked text-like block of a linked
 * signature (1.3.0). Re-applied by the server every time the template
 * design is refreshed.
 */
export interface BlockOverride {
  content?: string;
  content_html?: string;
}

export interface SignatureSchema {
  schema_version: SchemaVersion;
  meta: SignatureMeta;
  canvas: CanvasConfig;
  blocks: Block[];
  variables: Record<string, string>;
  /** Template settings (1.3.0) — see {@link EmployeeMode}. */
  settings?: SignatureSettings;
  /** Linked signatures only (1.3.0): `{ [blockId]: BlockOverride }`. */
  overrides?: Record<string, BlockOverride>;
}

/**
 * Default factory used when no signature is loaded yet.
 */
export function createEmptySchema(): SignatureSchema {
  const now = new Date().toISOString();
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    meta: {
      created_at: now,
      updated_at: now,
      editor_version: '1.0.0',
    },
    canvas: {
      width: 600,
      background_color: '#ffffff',
      font_family: 'Arial, sans-serif',
      font_size: 14,
      text_color: '#111827',
      link_color: '#1d4ed8',
    },
    blocks: [],
    variables: {},
  };
}
