import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { QrCode, RefreshCw } from 'lucide-react';
import qrcode from 'qrcode-generator';
import type { Block, QrCodeBlock } from '@/core/schema/blocks';
import { generateId } from '@/utils/idGenerator';
import { __ } from '@/i18n/helpers';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { findBlockByIdDeep, useSchemaStore } from '@/stores/schemaStore';
import { isUploadEnabled } from '@/bridge/apiClient';
import {
  attr,
  escapeHtml,
  horizontalPadding,
  intPx,
  paddingCss,
  safeColor,
} from '@/core/compiler/css';
import { contentHash } from '@/core/compiler/hash';
import { clampToAvailable, markerAttr, report } from '@/core/compiler/issues';
import { canvasToBlob, uploadBlob, uploadErrorMessage, UploadError } from '@/services/uploads';
import { registerBlock, type BlockDefinition, type CompileContext } from '../registry';

/**
 * QR Code block.
 *
 * Email clients don't show data: images (Gmail, Outlook.com), so the
 * QR is rendered to a PNG at 2× its display size, uploaded through
 * `/upload/*`, and the compiled HTML references the hosted URL
 * (`image_url`). `image_hash` remembers which inputs the hosted PNG
 * was rendered from:
 *
 *  - the Properties panel re-renders + uploads (debounced ~800ms) when
 *    data / size / colours change, skipping identical content;
 *  - compile never needs a canvas: no `image_url` → nothing is emitted
 *    and an error is reported; a stale hash → the previous image is
 *    used and a warning is reported.
 *
 * The canvas renderer shows a locally generated preview so editing
 * stays instant while the upload is in flight.
 */

/** Hash of the inputs that determine the QR image. */
export function qrContentHash(
  block: Pick<QrCodeBlock, 'data' | 'size' | 'color' | 'background_color'>,
): string {
  return contentHash(
    [
      'qr-v1',
      block.data ?? '',
      intPx(block.size, 16, 1000, 120),
      safeColor(block.color, '#000000'),
      safeColor(block.background_color, '#ffffff'),
    ].join('|'),
  );
}

/**
 * Draws the QR onto a canvas at `scale`× the display size. Returns null
 * when there is no data, encoding fails, or no 2D canvas is available
 * (e.g. jsdom).
 */
export function renderQrCanvas(
  block: Pick<QrCodeBlock, 'data' | 'size' | 'color' | 'background_color'>,
  scale = 2,
): HTMLCanvasElement | null {
  if (!block.data || typeof document === 'undefined') return null;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(block.data);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const margin = 1;
    const target = intPx(block.size, 16, 1000, 120) * scale;
    const cellSize = Math.max(1, Math.floor(target / (moduleCount + margin * 2)));
    const totalSize = moduleCount * cellSize + margin * cellSize * 2;

    const canvas = document.createElement('canvas');
    canvas.width = totalSize;
    canvas.height = totalSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = safeColor(block.background_color, '#ffffff');
    ctx.fillRect(0, 0, totalSize, totalSize);
    ctx.fillStyle = safeColor(block.color, '#000000');
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(
            margin * cellSize + col * cellSize,
            margin * cellSize + row * cellSize,
            cellSize,
            cellSize,
          );
        }
      }
    }
    return canvas;
  } catch {
    return null;
  }
}

/** Local (never exported) preview for the canvas while editing. */
function previewDataUrl(
  block: Pick<QrCodeBlock, 'data' | 'size' | 'color' | 'background_color'>,
): string {
  const canvas = renderQrCanvas(block, 2);
  if (!canvas) return '';
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/**
 * Renders the QR PNG (2× display size) and uploads it. Resolves to the
 * block fields to store.
 */
export async function uploadQrImage(
  block: QrCodeBlock,
): Promise<Pick<QrCodeBlock, 'image_url' | 'image_hash'>> {
  const canvas = renderQrCanvas(block, 2);
  if (!canvas) {
    throw new UploadError('qr_render', __('The QR code could not be generated in this browser.'));
  }
  const hash = qrContentHash(block);
  const blob = await canvasToBlob(canvas, 'image/png');
  const asset = await uploadBlob(blob, `qr-${hash}.png`, {
    width: canvas.width,
    height: canvas.height,
  });
  return { image_url: asset.url, image_hash: hash };
}

export type AssetSyncStatus = 'idle' | 'pending' | 'uploading' | 'error' | 'disabled';

interface AssetSyncOptions {
  blockId: string;
  /** Hash of the block's current content. */
  hash: string;
  /** Whether the hosted asset already matches `hash`. */
  upToDate: boolean;
  /** False when there is nothing to upload (e.g. empty QR data). */
  canSync: boolean;
  /** Produces the patch to store (uploads the asset). */
  upload: () => Promise<Partial<Block>>;
  /** Hash of a block as it is NOW in the store (to drop stale results). */
  hashOf: (block: Block) => string | null;
  delayMs?: number;
}

/**
 * Keeps a block's hosted asset (QR PNG / vCard file) in sync with its
 * content: debounced upload on change, results written through the
 * store's `updateBlock` (so they land even if the panel unmounted),
 * stale results discarded, pending work flushed on unmount.
 */
export function useHostedAssetSync(options: AssetSyncOptions): {
  status: AssetSyncStatus;
  error: string | null;
  retry: () => void;
} {
  const { blockId, hash, upToDate, canSync, delayMs = 800 } = options;
  const uploadEnabled = isUploadEnabled();
  const [status, setStatus] = useState<AssetSyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const optsRef = useRef(options);
  optsRef.current = options;
  const pendingRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Don't lose an edit made just before the panel closed.
      const pending = pendingRef.current;
      pendingRef.current = null;
      pending?.();
    };
  }, []);

  useEffect(() => {
    if (!uploadEnabled) {
      pendingRef.current = null;
      setStatus('disabled');
      return undefined;
    }
    if (upToDate || !canSync) {
      pendingRef.current = null;
      setStatus('idle');
      setError(null);
      return undefined;
    }

    const hashAtStart = hash;
    const run = (): void => {
      pendingRef.current = null;
      if (mountedRef.current) setStatus('uploading');
      optsRef.current
        .upload()
        .then((patch) => {
          const store = useSchemaStore.getState();
          const latest = findBlockByIdDeep(store.schema.blocks, blockId);
          // Content changed while uploading → a newer run owns it.
          if (!latest || optsRef.current.hashOf(latest) !== hashAtStart) return;
          store.updateBlock(blockId, patch);
          if (mountedRef.current) {
            setStatus('idle');
            setError(null);
          }
        })
        .catch((e: unknown) => {
          if (mountedRef.current) {
            setStatus('error');
            setError(uploadErrorMessage(e));
          }
        });
    };

    pendingRef.current = run;
    setStatus('pending');
    const timer = window.setTimeout(run, delayMs);
    return () => window.clearTimeout(timer);
  }, [blockId, hash, upToDate, canSync, uploadEnabled, delayMs, attempt]);

  return { status, error, retry: () => setAttempt((n) => n + 1) };
}

/** One-line status under QR / vCard properties. */
export const HostedAssetStatus: FC<{
  status: AssetSyncStatus;
  error: string | null;
  hosted: boolean;
  onRetry: () => void;
  disabledMessage: string;
}> = ({ status, error, hosted, onRetry, disabledMessage }) => {
  if (status === 'disabled') {
    return <p className="text-[10.5px] leading-snug text-amber-700">{disabledMessage}</p>;
  }
  if (status === 'error') {
    return (
      <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-red-700">
        <span className="flex-1">{__('Upload failed: %s', error ?? '')}</span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded px-1 font-medium text-red-700 hover:bg-red-50"
        >
          <RefreshCw size={10} />
          {__('Retry')}
        </button>
      </p>
    );
  }
  if (status === 'pending' || status === 'uploading') {
    return <p className="text-[10.5px] text-[var(--text-muted)]">{__('Uploading…')}</p>;
  }
  return hosted ? (
    <p className="text-[10.5px] text-emerald-700">{__('Hosted — ready for email.')}</p>
  ) : null;
};

const Renderer: FC<{ block: QrCodeBlock }> = ({ block }) => {
  const { data, size, color, background_color } = block;
  const preview = useMemo(
    () => previewDataUrl({ data, size, color, background_color }),
    [data, size, color, background_color],
  );
  const src = preview || block.image_url || '';
  const padding = block.padding;
  const td: React.CSSProperties = {
    padding: padding
      ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
      : '0',
    textAlign: 'center',
  };

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse' }}
    >
      <tbody>
        <tr>
          <td style={td}>
            {block.data && src ? (
              <img
                src={src}
                alt={block.caption || __('QR code')}
                width={block.size}
                height={block.size}
                style={{ display: 'block', border: 0, margin: '0 auto' }}
              />
            ) : (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {__('Add data to render the QR.')}
              </span>
            )}
            {block.caption && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#475569' }}>{block.caption}</div>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
};

const Properties: FC<{
  block: QrCodeBlock;
  onChange: (updates: Partial<QrCodeBlock>) => void;
}> = ({ block, onChange }) => {
  const hash = qrContentHash(block);
  const upToDate = Boolean(block.image_url) && block.image_hash === hash;
  const sync = useHostedAssetSync({
    blockId: block.id,
    hash,
    upToDate,
    canSync: Boolean(block.data),
    upload: () => uploadQrImage(block),
    hashOf: (latest) => (latest.type === 'qr_code' ? qrContentHash(latest) : null),
  });

  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-[var(--text-secondary)]">{__('Encoded data')}</span>
        <textarea
          rows={3}
          value={block.data}
          onChange={(e) => onChange({ data: e.target.value })}
          placeholder="https://example.com or BEGIN:VCARD…"
        />
        <span className="text-[10.5px] text-[var(--text-muted)]">
          {__('A URL, mailto:, tel:, or any other QR-encodable string.')}
        </span>
      </label>

      <DimensionInput
        label={__('Size (px)')}
        value={block.size}
        onChange={(v) => onChange({ size: v })}
        min={64}
        max={400}
      />

      <ColorInput
        label={__('Foreground')}
        value={block.color}
        onChange={(v) => onChange({ color: v })}
      />
      <ColorInput
        label={__('Background')}
        value={block.background_color}
        onChange={(v) => onChange({ background_color: v })}
      />

      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-[var(--text-secondary)]">{__('Caption (optional)')}</span>
        <input
          type="text"
          value={block.caption ?? ''}
          onChange={(e) => onChange({ caption: e.target.value || undefined })}
        />
      </label>

      <HostedAssetStatus
        status={sync.status}
        error={sync.error}
        hosted={upToDate}
        onRetry={sync.retry}
        disabledMessage={__(
          'Uploads are disabled on this site, so the QR code cannot be hosted and will not appear in the exported signature. Generate the QR elsewhere and add it with an Image block.',
        )}
      />
    </div>
  );
};

function compile(block: QrCodeBlock, ctx: CompileContext): string {
  if (!block.data) return '';

  if (!block.image_url) {
    report(
      ctx,
      'error',
      __(
        'QR code image not uploaded yet. Select the QR block (or use “Fix embedded images”) to upload it.',
      ),
      block,
      'qr-not-uploaded',
    );
    return '';
  }
  if (block.image_hash !== qrContentHash(block)) {
    report(
      ctx,
      'warning',
      __(
        'The hosted QR code image is out of date with the block settings; it is being re-uploaded.',
      ),
      block,
      'qr-stale',
    );
  }

  const padding = paddingCss(block.padding);
  const available = ctx.availableWidth - horizontalPadding(block.padding);
  const size = clampToAvailable(ctx, block, intPx(block.size, 16, 1000, 120), available);
  const alt = attr(block.caption || __('QR code'));
  const captionHtml = block.caption
    ? `<div style="margin-top:4px;font-size:11px;color:#475569">${escapeHtml(block.caption)}</div>`
    : '';

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:${padding};text-align:center"><img${markerAttr(block)} src="${attr(block.image_url)}" alt="${alt}" width="${size}" height="${size}" style="display:block;border:0;margin:0 auto;max-width:100%;height:auto" />${captionHtml}</td></tr></table>`;
}

const definition: BlockDefinition<QrCodeBlock> = {
  type: 'qr_code',
  label: 'QR Code',
  description: 'Scannable QR code, hosted as a PNG image.',
  icon: QrCode,
  category: 'content',
  create: (): QrCodeBlock => ({
    id: generateId('qr'),
    type: 'qr_code',
    data: 'https://example.com',
    size: 120,
    color: '#000000',
    background_color: '#ffffff',
    padding: { top: 4, right: 0, bottom: 4, left: 0 },
  }),
  Renderer,
  PropertiesPanel: Properties,
  compile,
};

registerBlock(definition);

export { definition as qrCodeDefinition };
