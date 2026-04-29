// Re-exports + factory helpers for the signature schema.

export * from '@shared/types';
import type {
  Block,
  CanvasConfig,
  LayoutConfig,
  SignatureSchema,
} from '@shared/types';
import { CANVAS_DEFAULTS, SCHEMA_VERSION } from '@shared/constants';

export function emptySchema(): SignatureSchema {
  const now = new Date().toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    meta: { created_at: now, updated_at: now, editor_version: '1.0.0' },
    canvas: { ...CANVAS_DEFAULTS } satisfies CanvasConfig,
    layout: {
      type: 'table',
      columns: 1,
      gap: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    } satisfies LayoutConfig,
    blocks: [] satisfies Block[],
    variables: {},
  };
}
