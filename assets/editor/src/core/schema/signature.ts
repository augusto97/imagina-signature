import type { Block } from './blocks';

/**
 * Top-level signature schema (CLAUDE.md §8.1).
 *
 * Every signature persisted in `imgsig_signatures.json_content` round-
 * trips through this shape. `schema_version` is checked on load and
 * controls the migration path when newer versions ship.
 */

export type SchemaVersion = '1.0';

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

export interface SignatureSchema {
  schema_version: SchemaVersion;
  meta: SignatureMeta;
  canvas: CanvasConfig;
  blocks: Block[];
  variables: Record<string, string>;
}

/**
 * Default factory used when no signature is loaded yet.
 */
export function createEmptySchema(): SignatureSchema {
  const now = new Date().toISOString();
  return {
    schema_version: '1.0',
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
