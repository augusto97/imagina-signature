import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { persistence } from '@/services/persistence';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { createEmptySchema, type SignatureSchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';

/**
 * Regression coverage for the headline 1.0.23 bug: when the user typed
 * a Name on a brand-new signature with no blocks yet, autosave would
 * fire `markSaved()` even though no POST went out. The topbar showed
 * "Saved · HH:MM" while the listing remained empty.
 *
 * The fix moves the empty-blocks guard ahead of `dirty = false` and
 * only calls `markSaved()` when at least one round-trip completed.
 * These tests pin that contract.
 */

const persistenceInternal = persistence as unknown as {
  signatureId: number;
  initialized: boolean;
  saveTimer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  dirty: boolean;
};

function reset(): void {
  persistenceInternal.signatureId = 0;
  persistenceInternal.initialized = true;
  persistenceInternal.saveTimer = null;
  persistenceInternal.inFlight = null;
  persistenceInternal.dirty = false;
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

describe('persistence engine', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('autosave on an empty signature drains dirty WITHOUT setting lastSavedAt', async () => {
    // Simulate the user typing a name on a fresh signature with no
    // blocks yet — this is the path that was producing the false
    // "Saved" topbar state in 1.0.23.
    usePersistenceStore.getState().setSignatureName('My signature');
    persistenceInternal.dirty = true;

    // Internal access: invoke the same path scheduleSave's debounced
    // timer would, but synchronously.
    await (persistence as unknown as { performSave: (allow: boolean) => Promise<void> }).performSave(
      false,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(usePersistenceStore.getState().lastSavedAt).toBeNull();
    expect(usePersistenceStore.getState().isSaving).toBe(false);
    expect(usePersistenceStore.getState().isDirty).toBe(false);
  });

  it('autosave with at least one block POSTs and sets lastSavedAt', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 42 }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    );

    useSchemaStore.setState((s) => {
      const schema: SignatureSchema = { ...s.schema, blocks: [textBlock] };
      return { schema, hasUserEdited: true };
    });
    persistenceInternal.dirty = true;

    await (persistence as unknown as { performSave: (allow: boolean) => Promise<void> }).performSave(
      false,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
    expect(persistenceInternal.signatureId).toBe(42);
    expect(usePersistenceStore.getState().lastSavedAt).not.toBeNull();
    expect(usePersistenceStore.getState().isDirty).toBe(false);
  });

  it('manual saveNow on an empty signature posts even with no blocks (allowEmpty=true)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 7 }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    );

    persistenceInternal.dirty = false; // saveNow forces it to true internally
    await persistence.saveNow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
    expect(usePersistenceStore.getState().lastSavedAt).not.toBeNull();
  });
});
