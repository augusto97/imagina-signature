/**
 * Persistence engine.
 *
 * One save = one round trip:
 *   1. POST /signatures (new) or PATCH /signatures/:id (existing).
 *   2. The backend sanitises, writes, re-reads and hash-verifies the
 *      row, then returns the canonical stored state.
 *   3. If the server removed something (it reports
 *      `sanitization_notes`), the editor adopts the server's copy so
 *      what the user sees is what is stored, and says what changed.
 *
 * Autosave is a debounced call to the same path. It is silent on
 * success (the Save button shows "Saved · HH:MM"); only manual saves
 * toast. A 429 from the rate limiter pauses autosave until the
 * server's Retry-After window passes instead of reporting a failure.
 */

import { apiCall, ApiError, getConfig } from '@/bridge/apiClient';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useToastStore } from '@/stores/toastStore';
import type { SignatureSchema } from '@/core/schema/signature';
import { compileSignature } from '@/core/compiler/compile';
import { __ } from '@/i18n/helpers';

/** Delay between the last edit and the autosave. */
const AUTOSAVE_DEBOUNCE_MS = 1500;

/** Fallback pause when a 429 carries no usable retry_after. */
const DEFAULT_RETRY_AFTER_S = 60;

interface SaveOptions {
  /** Autosave: no success toast, 429 schedules a retry instead of erroring. */
  silent?: boolean;
}

interface SanitizationNote {
  path: string;
  message: string;
}

interface SaveResponse {
  id: number;
  json_content: unknown;
  name: string;
  status: 'draft' | 'ready' | 'archived';
  sanitization_notes?: SanitizationNote[];
}

/**
 * Structural equality that treats an empty array and an empty object as
 * the same value — PHP's JSON round trip can't tell them apart.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const emptyA = isEmptyContainer(a);
  const emptyB = isEmptyContainer(b);
  if (emptyA || emptyB) return emptyA && emptyB;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameJson(item, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
    for (const key of keys) {
      if (!sameJson(ra[key], rb[key])) return false;
    }
    return true;
  }
  return false;
}

function isEmptyContainer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value !== null && typeof value === 'object' && Object.keys(value).length === 0;
}

/** Fragment + plain text for the server copy, or null if compiling threw. */
export function compileForServer(schema: SignatureSchema): { html: string; text: string } | null {
  try {
    const result = compileSignature(schema);
    return { html: result.fragment, text: result.text };
  } catch {
    return null;
  }
}

class Persistence {
  private signatureId = 0;
  private initialized = false;
  /** Shared by concurrent saveNow() calls so they never double-POST. */
  private inFlight: Promise<number> | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Epoch ms until which autosave is paused after a 429. */
  private pausedUntil = 0;

  /** Id of the row being edited (0 until the first save of a new signature). */
  currentId(): number {
    this.initialize();
    return this.signatureId;
  }

  /** Bind to the bootstrap config. Idempotent. */
  initialize(): void {
    if (this.initialized) return;
    this.signatureId = getConfig().signatureId;
    this.initialized = true;
  }

  /**
   * Drop the in-memory signature id so the next save POSTs a fresh
   * row. Called from `useLoadSignature` when `?id=N` 404s.
   */
  resetToNew(): void {
    this.signatureId = 0;
    this.initialized = true;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState(null, '', url.toString());
    } catch {
      // history API unavailable — non-fatal.
    }
  }

  /** Debounced autosave; each call restarts the timer. */
  scheduleSave(): void {
    this.cancelScheduledSave();
    const wait = Math.max(AUTOSAVE_DEBOUNCE_MS, this.pausedUntil - Date.now());
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.saveNow({ silent: true });
    }, wait);
  }

  /** Cancel any pending autosave. Used by the back-arrow handler. */
  cancelScheduledSave(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  /** True iff a save is currently in flight or queued. */
  hasPending(): boolean {
    return this.inFlight !== null || this.autosaveTimer !== null;
  }

  /**
   * Save now. Called by the Save button, Cmd/Ctrl+S, the back arrow
   * (all loud) and the autosave timer (silent). Returns the signature
   * id on success, 0 when nothing was stored.
   */
  async saveNow(options: SaveOptions = {}): Promise<number> {
    this.cancelScheduledSave();
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.runSave(options);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async runSave(options: SaveOptions): Promise<number> {
    const silent = options.silent === true;
    const persistence = usePersistenceStore.getState();
    const showToast = useToastStore.getState().show;

    const schema = useSchemaStore.getState().schema;
    const meta = usePersistenceStore.getState();
    const rowName = meta.signatureName.trim() || __('Untitled');
    const rowStatus = meta.signatureStatus;

    // Never create an empty row: the listing would show a phantom
    // signature. PATCHing an existing one to empty is allowed.
    if (this.signatureId === 0 && schema.blocks.length === 0) {
      if (!silent) {
        showToast(
          __('Add at least one block before saving — empty signatures are not stored.'),
          'info',
        );
      }
      return 0;
    }

    persistence.markSaving();

    // The server keeps the compiled signature so it can deploy it on its
    // own (Gmail, Outlook add-in, install links). A compile failure must
    // never block saving the design itself.
    const compiled = compileForServer(schema);
    // 1.3.0: the fingerprint of the inputs this page compiled with — when
    // the owner's details or the company settings changed since the page
    // loaded, the server stores this HTML as outdated instead of fresh.
    const inputsHash = getConfig().inputsHash;
    const body = {
      name: rowName,
      status: rowStatus,
      json_content: schema,
      ...(compiled
        ? {
            html: compiled.html,
            text: compiled.text,
            ...(typeof inputsHash === 'string' && inputsHash !== '' ? { inputs_hash: inputsHash } : {}),
          }
        : {}),
    };

    try {
      let response: SaveResponse;
      if (this.signatureId > 0) {
        response = await apiCall<SaveResponse>(`/signatures/${this.signatureId}`, {
          method: 'PATCH',
          body,
        });
      } else {
        response = await apiCall<SaveResponse>('/signatures', {
          method: 'POST',
          body,
        });
        if (typeof response?.id !== 'number' || response.id <= 0) {
          throw new Error(__('The server returned no signature id.'));
        }
        this.signatureId = response.id;
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('id', String(response.id));
          window.history.replaceState(null, '', url.toString());
        } catch {
          // history API unavailable — non-fatal.
        }
      }

      this.pausedUntil = 0;
      this.reconcile(schema, response, showToast);

      persistence.markSaved();
      if (!silent) {
        showToast(__('Saved.'), 'success');
      }
      return this.signatureId;
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        return this.handleRateLimit(e, silent, showToast);
      }
      const message =
        e instanceof ApiError ? `${e.message} [${e.code}, ${e.status}]` : (e as Error).message;
      persistence.setError(message);
      showToast(__('Save failed: %s', message), 'error');
      return 0;
    }
  }

  /**
   * Compare what we sent with what the server stored. When the server
   * removed content for safety, adopt its copy (keeping undo history)
   * and tell the user what changed instead of a vague "differs" note.
   */
  private reconcile(
    sent: SignatureSchema,
    response: SaveResponse,
    showToast: (message: string, kind: 'success' | 'error' | 'info') => void,
  ): void {
    const stored = response.json_content;
    if (sameJson(sent, stored)) return;

    const notes = Array.isArray(response.sanitization_notes) ? response.sanitization_notes : [];
    const looksLikeSchema =
      stored !== null &&
      typeof stored === 'object' &&
      !Array.isArray(stored) &&
      Array.isArray((stored as { blocks?: unknown }).blocks);

    // Only adopt when the user hasn't edited further while the request
    // was in flight; otherwise the next save carries their newer edits.
    if (looksLikeSchema && useSchemaStore.getState().schema === sent) {
      useSchemaStore.getState().replaceSchemaForHistory(stored as SignatureSchema);
    }

    if (notes.length > 0) {
      showToast(
        __('Some content was removed for security: %s', notes.map((n) => n.message).join('; ')),
        'info',
      );
    } else {
      showToast(
        __('Saved, but the server adjusted some content. The editor now shows the stored version.'),
        'info',
      );
    }
  }

  private handleRateLimit(
    e: ApiError,
    silent: boolean,
    showToast: (message: string, kind: 'success' | 'error' | 'info') => void,
  ): number {
    const data = (e.data ?? {}) as { retry_after?: unknown };
    const retryAfter = Number(data.retry_after);
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : DEFAULT_RETRY_AFTER_S;
    this.pausedUntil = Date.now() + seconds * 1000;

    // Keep the document dirty and try again once the window passes.
    usePersistenceStore.getState().markDirty();
    this.scheduleSave();

    showToast(
      silent
        ? __('Autosave paused for %s seconds (too many saves). Your changes are kept.', String(Math.ceil(seconds)))
        : __('Too many saves in a short time. Retrying in %s seconds.', String(Math.ceil(seconds))),
      'info',
    );
    return 0;
  }
}

export const persistence = new Persistence();
