import { useEffect, useRef } from 'react';
import type { Block, QrCodeBlock, VCardBlock } from '@/core/schema/blocks';
import { useSchemaStore, findBlockByIdDeep } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { isUploadEnabled } from '@/bridge/apiClient';
import { qrContentHash, uploadQrImage } from '@/core/blocks/qr-code/definition';
import {
  uploadVCardFile,
  vcardContentHash,
  vcardHasDetails,
} from '@/core/blocks/vcard/definition';

const DEBOUNCE_MS = 1200;

interface PendingAsset {
  id: string;
  hash: string;
  upload: () => Promise<Partial<Block>>;
  hashOf: (block: Block) => string | null;
}

/**
 * Uploads the hosted files (QR PNG, vCard .vcf) of blocks whose
 * properties panel is NOT open — blocks added by a click, inserted by a
 * template, or edited and then deselected. The selected block's panel
 * runs its own sync (with on-screen status), so it is skipped here to
 * avoid double uploads. Uploads run one at a time.
 */
export function BackgroundAssetSync(): null {
  const schema = useSchemaStore((s) => s.schema);
  const selectedId = useSelectionStore((s) => s.selectedBlockId);
  const busy = useRef(false);
  const failed = useRef(new Map<string, string>());

  useEffect(() => {
    if (!isUploadEnabled()) return undefined;

    const pending = collectPending(schema.blocks, selectedId).filter(
      (p) => failed.current.get(p.id) !== p.hash,
    );
    if (pending.length === 0) return undefined;

    const timer = window.setTimeout(() => {
      if (busy.current) return;
      busy.current = true;
      void (async () => {
        for (const item of pending) {
          try {
            const patch = await item.upload();
            const store = useSchemaStore.getState();
            const latest = findBlockByIdDeep(store.schema.blocks, item.id);
            if (latest && item.hashOf(latest) === item.hash) {
              store.updateBlock(item.id, patch);
            }
          } catch {
            // Remember the failure for this content so we don't loop;
            // opening the block's panel shows the error with a Retry.
            failed.current.set(item.id, item.hash);
          }
        }
        busy.current = false;
      })();
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [schema, selectedId]);

  return null;
}

function collectPending(blocks: Block[], selectedId: string | null): PendingAsset[] {
  const out: PendingAsset[] = [];
  const visit = (list: Block[]): void => {
    for (const block of list) {
      if (block.id !== selectedId) {
        if (block.type === 'qr_code') {
          const qr = block as QrCodeBlock;
          const hash = qrContentHash(qr);
          if (qr.data && !(qr.image_url && qr.image_hash === hash)) {
            out.push({
              id: qr.id,
              hash,
              upload: () => uploadQrImage(qr),
              hashOf: (b) => (b.type === 'qr_code' ? qrContentHash(b as QrCodeBlock) : null),
            });
          }
        } else if (block.type === 'vcard') {
          const card = block as VCardBlock;
          const hash = vcardContentHash(card);
          if (vcardHasDetails(card) && !(card.vcf_url && card.vcf_hash === hash)) {
            out.push({
              id: card.id,
              hash,
              upload: () => uploadVCardFile(card),
              hashOf: (b) => (b.type === 'vcard' ? vcardContentHash(b as VCardBlock) : null),
            });
          }
        }
      }
      const nested = block as { children?: Block[]; right_children?: Block[] };
      if (Array.isArray(nested.children)) visit(nested.children);
      if (Array.isArray(nested.right_children)) visit(nested.right_children);
    }
  };
  visit(blocks);
  return out;
}
