import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvatarBlock } from '@/core/schema/blocks';
import { isUploadEnabled } from '@/bridge/apiClient';
import { findBlockByIdDeep, useSchemaStore } from '@/stores/schemaStore';
import { uploadErrorMessage } from '@/services/uploads';
import { desiredSpec, needsProcessing, resolveAvatar, sameSpec } from './model';
import { renderAvatar } from './processAvatar';

export type AvatarProcessStatus = 'idle' | 'pending' | 'working' | 'error';

const DEBOUNCE_MS = 700;

export interface AvatarProcessing {
  status: AvatarProcessStatus;
  error: string | null;
  /**
   * Discrete changes (shape, new photo, crop): renders the avatar
   * first and writes the change and the rendered image in ONE update,
   * so a single undo restores a consistent block. On failure the
   * change is still written (CSS rendering) and the error shown.
   */
  commitNow: (patch: Partial<AvatarBlock>) => void;
  /**
   * Continuous changes (size, ring width / colour): written at once
   * for a live canvas, the image is re-rendered after a pause.
   */
  commitLater: (patch: Partial<AvatarBlock>) => void;
  /** Re-renders for the block as it is now (Retry / "Update image"). */
  renderNow: () => void;
}

/**
 * Keeps an avatar's rendered PNG in step with its settings — driven by
 * the user's edits in the panel only, never by a store subscription, so
 * undoing a rendered image does not trigger a re-render that would
 * swallow the undo. Results go through the store's `updateBlock`, so
 * they land even when the panel has closed; pending work is flushed on
 * unmount; stale results are discarded.
 */
export function useAvatarProcessing(
  blockId: string,
  onChange: (patch: Partial<AvatarBlock>) => void,
): AvatarProcessing {
  const [status, setStatus] = useState<AvatarProcessStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const inFlight = useRef(0);
  const timer = useRef<number | null>(null);
  const pending = useRef<(() => void) | null>(null);
  /** Changes of "now" commits still rendering (merged into a superseding one). */
  const unwritten = useRef<Partial<AvatarBlock>>({});

  const latest = useCallback((): AvatarBlock | null => {
    const block = findBlockByIdDeep(useSchemaStore.getState().schema.blocks, blockId);
    return block && block.type === 'avatar' ? (block as AvatarBlock) : null;
  }, [blockId]);

  const write = useCallback(
    (patch: Partial<AvatarBlock>) => useSchemaStore.getState().updateBlock(blockId, patch),
    [blockId],
  );

  const renderNow = useCallback((): void => {
    const block = latest();
    // Never pre-empt a render in flight (it may carry an unwritten change).
    if (!block || !isUploadEnabled() || inFlight.current > 0) return;
    const avatar = resolveAvatar(block);
    if (!needsProcessing(avatar)) {
      setStatus('idle');
      setError(null);
      return;
    }
    const spec = desiredSpec(avatar)!;
    const id = ++seq.current;
    inFlight.current++;
    setStatus('working');
    setError(null);
    renderAvatar(spec)
      .then((result) => {
        if (id !== seq.current) return;
        const now = latest();
        // Gone, or the settings moved on while rendering (a newer run
        // owns it, or the source was replaced by a pasted URL).
        if (now && sameSpec(desiredSpec(resolveAvatar(now)), spec)) write(result);
        setStatus((s) => (s === 'working' ? 'idle' : s));
      })
      .catch((e: unknown) => {
        if (id !== seq.current) return;
        setStatus('error');
        setError(uploadErrorMessage(e));
      })
      .finally(() => {
        inFlight.current--;
      });
  }, [latest, write]);

  const run = useCallback((): void => {
    pending.current = null;
    timer.current = null;
    // A "now" commit is rendering: wait for it rather than pre-empting it.
    if (inFlight.current > 0) {
      pending.current = run;
      timer.current = window.setTimeout(run, DEBOUNCE_MS);
      return;
    }
    renderNow();
  }, [renderNow]);

  const commitLater = useCallback(
    (patch: Partial<AvatarBlock>): void => {
      onChange(patch);
      if (!isUploadEnabled()) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      pending.current = run;
      setStatus('pending');
      timer.current = window.setTimeout(run, DEBOUNCE_MS);
    },
    [onChange, run],
  );

  const commitNow = useCallback(
    (input: Partial<AvatarBlock>): void => {
      // A superseded commit's change (e.g. the new photo) must not be lost.
      const patch = { ...unwritten.current, ...input };
      const block = latest();
      const next = block ? ({ ...block, ...patch } as AvatarBlock) : null;
      const avatar = next ? resolveAvatar(next) : null;
      if (!avatar || !isUploadEnabled() || !needsProcessing(avatar)) {
        unwritten.current = {};
        seq.current++;
        onChange(patch);
        return;
      }
      unwritten.current = patch;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
        pending.current = null;
      }
      const spec = desiredSpec(avatar)!;
      const id = ++seq.current;
      inFlight.current++;
      setStatus('working');
      setError(null);
      renderAvatar(spec)
        .then((result) => {
          if (id !== seq.current) return;
          unwritten.current = {};
          write({ ...patch, ...result });
          setStatus('idle');
        })
        .catch((e: unknown) => {
          if (id !== seq.current) return;
          unwritten.current = {};
          write(patch);
          setStatus('error');
          setError(uploadErrorMessage(e));
        })
        .finally(() => {
          inFlight.current--;
        });
    },
    [latest, onChange, write],
  );

  useEffect(
    () => () => {
      // Don't lose a re-render scheduled just before the panel closed.
      if (timer.current !== null) window.clearTimeout(timer.current);
      const flush = pending.current;
      pending.current = null;
      timer.current = null;
      flush?.();
    },
    [],
  );

  return { status, error, commitNow, commitLater, renderNow };
}
