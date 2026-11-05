/**
 * "Recompile outdated" (1.3.0): the browser is the only compiler, so the
 * team console walks every signature whose stored HTML is outdated,
 * compiles each with its OWNER's render context and stores the result.
 *
 *   GET  /admin/signatures/stale?after_id=N&per_page=P  (X-WP-Total = how many)
 *   GET  /admin/signatures/:id/render-context
 *   POST /admin/signatures/:id/html  { html, text, expected_updated_at, expected_inputs_hash }
 *
 * Rows leave the stale list as they are recompiled, so the walk pages
 * with `after_id` (the last id seen), never with growing page numbers;
 * a row that fails stays stale and is simply passed. A 409 (the design
 * or the owner's inputs changed while compiling) re-fetches the context
 * and retries once. Sequential — one signature at a time — so a shared
 * host never sees a burst. Cancel stops before the next signature.
 */

import type { RenderContext, StaleSignature } from './types';

export interface RecompileError {
  signatureId: number;
  userId: number;
  name: string;
  message: string;
}

export interface RecompileProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  errors: RecompileError[];
  running: boolean;
  cancelled: boolean;
}

export interface RecompileDeps {
  /** One page of the stale list after `afterId`, plus the total (X-WP-Total). */
  listStale: (
    afterId: number,
    perPage: number,
  ) => Promise<{ items: StaleSignature[]; total: number }>;
  loadContext: (signatureId: number) => Promise<RenderContext>;
  compile: (context: RenderContext) => { html: string; text: string };
  store: (
    signatureId: number,
    body: {
      html: string;
      text: string;
      expected_updated_at: string;
      expected_inputs_hash?: string;
    },
  ) => Promise<unknown>;
  /** True for a 409 from the store request. */
  isConflict: (error: unknown) => boolean;
  /** Message shown for a failed row. */
  describe: (error: unknown) => string;
}

export interface RecompileOptions {
  signal?: AbortSignal;
  onProgress?: (progress: RecompileProgress) => void;
  perPage?: number;
}

export const RECOMPILE_PAGE_SIZE = 20;

/** Compiles and stores one signature; one retry after a 409. */
export async function recompileOne(deps: RecompileDeps, signatureId: number): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const context = await deps.loadContext(signatureId);
    const compiled = deps.compile(context);
    try {
      await deps.store(signatureId, {
        html: compiled.html,
        text: compiled.text,
        expected_updated_at: context.updated_at,
        ...(context.inputs_hash ? { expected_inputs_hash: context.inputs_hash } : {}),
      });
      return;
    } catch (error) {
      if (attempt === 0 && deps.isConflict(error)) continue;
      throw error;
    }
  }
}

/** Walks the whole stale list. Resolves with the final progress (also after a cancel). */
export async function runRecompile(
  deps: RecompileDeps,
  options: RecompileOptions = {},
): Promise<RecompileProgress> {
  const perPage = options.perPage ?? RECOMPILE_PAGE_SIZE;
  const progress: RecompileProgress = {
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
    running: true,
    cancelled: false,
  };
  const emit = (): void => options.onProgress?.({ ...progress, errors: [...progress.errors] });
  const aborted = (): boolean => options.signal?.aborted === true;

  let afterId = 0;
  let first = true;
  try {
    while (!aborted()) {
      const page = await deps.listStale(afterId, perPage);
      if (first) {
        progress.total = page.total;
        first = false;
        emit();
      }
      for (const item of page.items) {
        if (aborted()) break;
        try {
          await recompileOne(deps, item.id);
          progress.succeeded++;
        } catch (error) {
          progress.failed++;
          progress.errors.push({
            signatureId: item.id,
            userId: item.user_id,
            name: item.name,
            message: deps.describe(error),
          });
        }
        progress.processed++;
        // Signatures that became outdated meanwhile join the run.
        progress.total = Math.max(progress.total, progress.processed);
        afterId = Math.max(afterId, item.id);
        emit();
      }
      if (page.items.length < perPage) break;
    }
  } finally {
    progress.cancelled = aborted();
    progress.running = false;
    emit();
  }
  return { ...progress, errors: [...progress.errors] };
}
