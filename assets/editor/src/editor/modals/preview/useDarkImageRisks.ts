import { useEffect, useMemo, useState } from 'react';
import type { CompiledImage } from '@/core/compiler/images';
import type { Block } from '@/core/schema/blocks';
import { findBlockByIdDeep, useSchemaStore } from '@/stores/schemaStore';
import {
  analyzeImageUrl,
  darkImageCandidates,
  lightBoxFor,
  type DarkImageAnalysis,
  type DarkImageCandidate,
} from './darkImages';

/**
 * Loads every candidate image once (results are cached per URL for the
 * page's lifetime) and returns the ones that are mostly dark on a
 * transparent background. Images that cannot be read — CORS-tainted
 * canvas, load error, timeout — are skipped silently.
 */
export function useDarkImageRisks(images: CompiledImage[], enabled: boolean): DarkImageCandidate[] {
  const blocks = useSchemaStore((s) => s.schema.blocks);
  const candidates = useMemo(
    () => (enabled ? darkImageCandidates(images, blocks) : []),
    [enabled, images, blocks],
  );
  const [results, setResults] = useState<Record<string, DarkImageAnalysis | null>>({});

  useEffect(() => {
    let active = true;
    for (const { src } of candidates) {
      void analyzeImageUrl(src).then((analysis) => {
        if (!active) return;
        setResults((prev) => (src in prev ? prev : { ...prev, [src]: analysis }));
      });
    }
    return () => {
      active = false;
    };
  }, [candidates]);

  return candidates.filter((c) => results[c.src]?.risky === true);
}

/**
 * One-click fix: gives the block a light box background through the
 * store's existing `updateBlock` action (box styling is a generic
 * `BlockBase` field, compiled by `core/compiler/box.ts`).
 */
export function addLightBackground(blockId: string): void {
  const store = useSchemaStore.getState();
  const block = findBlockByIdDeep(store.schema.blocks, blockId);
  if (!block) return;
  store.updateBlock(blockId, { box: lightBoxFor(block.box) } as Partial<Block>);
}
