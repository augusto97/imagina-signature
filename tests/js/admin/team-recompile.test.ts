import { describe, expect, it, vi } from 'vitest';
import {
  recompileOne,
  runRecompile,
  type RecompileDeps,
  type RecompileProgress,
} from '@admin/pages/team/recompile';
import type { RenderContext, StaleSignature } from '@admin/pages/team/types';

class Conflict extends Error {
  status = 409;
}

function stale(id: number): StaleSignature {
  return {
    id,
    user_id: id * 10,
    name: `Signature ${id}`,
    template_id: null,
    link_mode: 'detached',
    status: 'ready',
    updated_at: '2026-11-05 10:00:00',
    compiled_at: null,
  };
}

function context(id: number, version = 1): RenderContext {
  return {
    id,
    user_id: id * 10,
    name: `Signature ${id}`,
    template_id: null,
    link_mode: 'detached',
    updated_at: `2026-11-05 10:00:0${version}`,
    compiled_at: null,
    locale: 'es_ES',
    json_content: { blocks: [], canvas: {} },
    systemVariables: { wp_display_name: `User ${id}` },
    complianceFooter: { enabled: false, html: '' },
    bannerCampaigns: [],
    inputs_hash: `hash-${id}-${version}`,
  };
}

/**
 * An in-memory stale list: a stored signature leaves it, like on the server.
 */
function server(ids: number[]) {
  const pending = new Set(ids);
  const stored: Array<{ id: number; body: Record<string, unknown> }> = [];
  const listCalls: number[] = [];
  const deps: RecompileDeps = {
    listStale: vi.fn(async (afterId: number, perPage: number) => {
      listCalls.push(afterId);
      const all = [...pending].sort((a, b) => a - b);
      return {
        items: all
          .filter((id) => id > afterId)
          .slice(0, perPage)
          .map(stale),
        total: all.length,
      };
    }),
    loadContext: vi.fn(async (id: number) => context(id)),
    compile: vi.fn((ctx: RenderContext) => ({
      html: `<table><tr><td>${ctx.systemVariables.wp_display_name}</td></tr></table>`,
      text: String(ctx.systemVariables.wp_display_name),
    })),
    store: vi.fn(async (id: number, body) => {
      stored.push({ id, body });
      pending.delete(id);
      return {};
    }),
    isConflict: (e) => e instanceof Conflict,
    describe: (e) => (e instanceof Error ? e.message : String(e)),
  };
  return { deps, stored, listCalls, pending };
}

describe('recompile outdated signatures', () => {
  it('walks the stale list with after_id and stores each owner-compiled result', async () => {
    const { deps, stored, listCalls } = server([3, 5, 8, 9, 12]);
    const events: RecompileProgress[] = [];

    const result = await runRecompile(deps, { perPage: 2, onProgress: (p) => events.push(p) });

    expect(stored.map((s) => s.id)).toEqual([3, 5, 8, 9, 12]);
    // Pages [3, 5], [8, 9], [12]: the short last page ends the walk.
    expect(listCalls).toEqual([0, 5, 9]);
    expect(stored[0]!.body).toEqual({
      html: '<table><tr><td>User 3</td></tr></table>',
      text: 'User 3',
      expected_updated_at: '2026-11-05 10:00:01',
      expected_inputs_hash: 'hash-3-1',
    });
    expect(result).toMatchObject({
      total: 5,
      processed: 5,
      succeeded: 5,
      failed: 0,
      running: false,
      cancelled: false,
    });
    expect(events[0]).toMatchObject({ total: 5, processed: 0, running: true });
    expect(events.at(-1)).toMatchObject({ processed: 5, running: false });
  });

  it('re-fetches the context once after a 409, then stores the fresh compile', async () => {
    const { deps, stored } = server([4]);
    let version = 0;
    deps.loadContext = vi.fn(async (id: number) => context(id, ++version));
    const store = deps.store;
    let first = true;
    deps.store = vi.fn(async (id, body) => {
      if (first) {
        first = false;
        throw new Conflict('changed meanwhile');
      }
      return store(id, body);
    });

    await recompileOne(deps, 4);

    expect(deps.loadContext).toHaveBeenCalledTimes(2);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.body.expected_updated_at).toBe('2026-11-05 10:00:02');
    expect(stored[0]!.body.expected_inputs_hash).toBe('hash-4-2');
  });

  it('reports a row that conflicts twice, or fails to compile, and carries on', async () => {
    const { deps, stored } = server([1, 2, 3]);
    const store = deps.store;
    deps.store = vi.fn(async (id, body) => {
      if (id === 1) throw new Conflict('still changing');
      return store(id, body);
    });
    deps.compile = vi.fn((ctx: RenderContext) => {
      if (ctx.id === 2) throw new Error('This signature has no readable content.');
      return { html: '<table></table>', text: '' };
    });

    const result = await runRecompile(deps, { perPage: 10 });

    expect(stored.map((s) => s.id)).toEqual([3]);
    expect(result.failed).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.errors).toEqual([
      { signatureId: 1, userId: 10, name: 'Signature 1', message: 'still changing' },
      {
        signatureId: 2,
        userId: 20,
        name: 'Signature 2',
        message: 'This signature has no readable content.',
      },
    ]);
    expect(deps.loadContext).toHaveBeenCalledTimes(4); // 1 twice (409 retry), 2 and 3 once.
  });

  it('a failed row stays stale but the walk moves past it', async () => {
    const { deps, listCalls } = server([1, 2, 3]);
    deps.compile = vi.fn(() => {
      throw new Error('boom');
    });

    const result = await runRecompile(deps, { perPage: 1 });

    expect(listCalls).toEqual([0, 1, 2, 3]);
    expect(result).toMatchObject({ processed: 3, failed: 3 });
  });

  it('stops before the next signature when cancelled', async () => {
    const { deps, stored } = server([1, 2, 3, 4]);
    const controller = new AbortController();
    const store = deps.store;
    deps.store = vi.fn(async (id, body) => {
      const out = await store(id, body);
      if (id === 2) controller.abort();
      return out;
    });

    const result = await runRecompile(deps, { perPage: 10, signal: controller.signal });

    expect(stored.map((s) => s.id)).toEqual([1, 2]);
    expect(result).toMatchObject({ processed: 2, cancelled: true, running: false });
  });

  it('counts signatures that became outdated during the run', async () => {
    const { deps, pending } = server([1]);
    const store = deps.store;
    deps.store = vi.fn(async (id, body) => {
      const out = await store(id, body);
      if (id === 1) pending.add(7);
      return out;
    });

    const result = await runRecompile(deps, { perPage: 1 });

    expect(result).toMatchObject({ total: 2, processed: 2, succeeded: 2 });
  });

  it('does nothing when nothing is outdated', async () => {
    const { deps } = server([]);
    const result = await runRecompile(deps);
    expect(result).toMatchObject({ total: 0, processed: 0, running: false });
    expect(deps.loadContext).not.toHaveBeenCalled();
  });
});
