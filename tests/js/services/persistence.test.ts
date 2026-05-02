import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { persistence } from '@/services/persistence';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';

/**
 * Persistence engine — explicit Save model (1.0.26).
 *
 * The autosave was deleted in 1.0.26 because it kept producing false-
 * positive "Saved · HH:MM" toasts. Saves now run only when the user
 * explicitly calls `persistence.saveNow()` (Save button / Cmd-S /
 * back-arrow). These tests pin the contract: saveNow is the only
 * way to commit, the response is verified, and an empty signature
 * doesn't POST a phantom row.
 */

const persistenceInternal = persistence as unknown as {
  signatureId: number;
  initialized: boolean;
  inFlight: Promise<number> | null;
};

function reset(): void {
  persistenceInternal.signatureId = 0;
  persistenceInternal.initialized = true;
  persistenceInternal.inFlight = null;
  useSchemaStore.setState({ schema: createEmptySchema(), hasUserEdited: false });
  usePersistenceStore.setState({
    isLoaded: true,
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    lastError: null,
    signatureName: 'Untitled',
    signatureStatus: 'draft',
  });
}

const textBlock: TextBlock = {
  id: 'b1',
  type: 'text',
  content: 'Hello',
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#000' },
};

describe('persistence.saveNow (1.0.26 explicit-save model)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses to POST a brand-new signature with zero blocks', async () => {
    // No blocks added, signatureId = 0. saveNow returns 0 without
    // touching the network — empty rows stay out of the listing.
    const id = await persistence.saveNow();
    expect(id).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usePersistenceStore.getState().lastSavedAt).toBeNull();
  });

  it('POSTs a new signature when the canvas has at least one block', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 42,
          name: 'Untitled',
          status: 'draft',
          json_content: { ...createEmptySchema(), blocks: [textBlock] },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    useSchemaStore.setState((s) => ({
      schema: { ...s.schema, blocks: [textBlock] },
      hasUserEdited: true,
    }));

    const id = await persistence.saveNow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
    expect(id).toBe(42);
    expect(usePersistenceStore.getState().lastSavedAt).not.toBeNull();
    expect(usePersistenceStore.getState().isDirty).toBe(false);
    expect(usePersistenceStore.getState().lastError).toBeNull();
  });

  it('PATCHes an existing signature and clears dirty on success', async () => {
    persistenceInternal.signatureId = 7;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 7,
          name: 'Untitled',
          status: 'draft',
          json_content: { ...createEmptySchema(), blocks: [textBlock] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    useSchemaStore.setState((s) => ({
      schema: { ...s.schema, blocks: [textBlock] },
      hasUserEdited: true,
    }));
    usePersistenceStore.getState().markDirty();
    expect(usePersistenceStore.getState().isDirty).toBe(true);

    const id = await persistence.saveNow();

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('PATCH');
    expect(id).toBe(7);
    expect(usePersistenceStore.getState().isDirty).toBe(false);
  });

  it('surfaces an error toast and does NOT mark saved when the server returns 500', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'imgsig_persistence_failed',
          message: 'persisted json_content does not match the input',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    useSchemaStore.setState((s) => ({
      schema: { ...s.schema, blocks: [textBlock] },
      hasUserEdited: true,
    }));

    const id = await persistence.saveNow();

    expect(id).toBe(0);
    expect(usePersistenceStore.getState().lastError).toContain('persisted json_content');
    expect(usePersistenceStore.getState().lastSavedAt).toBeNull();
  });

  it('coalesces concurrent saveNow calls onto a single in-flight request', async () => {
    let resolveResponse: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((res) => {
        resolveResponse = res;
      }),
    );

    useSchemaStore.setState((s) => ({
      schema: { ...s.schema, blocks: [textBlock] },
      hasUserEdited: true,
    }));

    const a = persistence.saveNow();
    const b = persistence.saveNow();
    const c = persistence.saveNow();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(
      new Response(
        JSON.stringify({
          id: 99,
          name: 'Untitled',
          status: 'draft',
          json_content: { ...createEmptySchema(), blocks: [textBlock] },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const ids = await Promise.all([a, b, c]);
    expect(ids).toEqual([99, 99, 99]);
  });
});
