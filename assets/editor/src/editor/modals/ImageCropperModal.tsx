import { useCallback, useState, type FC } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { Modal } from '@/components/shared/Modal';
import { __ } from '@/i18n/helpers';

interface Props {
  open: boolean;
  /** The image to crop. Can be a URL or a data URI. */
  src: string;
  /** Aspect ratio (width / height). 1 for avatar (square), undefined for free. */
  aspect?: number;
  /** Whether the crop should be displayed as a circle (purely visual). */
  circular?: boolean;
  /** Output mime type. Defaults to PNG so transparency is preserved. */
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** JPEG / WebP quality 0-1. Ignored for PNG. */
  quality?: number;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

/**
 * Image cropper modal — wraps `react-easy-crop` with a sensible
 * editor-shell layout (centred crop area, zoom slider, Cancel / Save
 * footer).
 *
 * Output is a data URI (base64 PNG / JPEG / WebP). Most modern email
 * clients render data URI `<img>` inline; older Outlook builds
 * sometimes strip them. For an externally-hosted URL, the user can
 * upload the cropped image to the Media Library / S3 separately and
 * paste the URL in — that path is unchanged.
 */
export const ImageCropperModal: FC<Props> = ({
  open,
  src,
  aspect,
  circular,
  mimeType = 'image/png',
  quality = 0.92,
  onCancel,
  onConfirm,
}) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const apply = async (): Promise<void> => {
    if (!croppedAreaPixels || busy) return;
    setBusy(true);
    try {
      const url = await renderCroppedImage(src, croppedAreaPixels, mimeType, quality);
      onConfirm(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={__('Crop image')} onClose={busy ? () => {} : onCancel} width={600}>
      <div className="flex flex-col gap-3">
        <div
          className="relative w-full overflow-hidden rounded-md bg-slate-900"
          style={{ height: 360 }}
        >
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape={circular ? 'round' : 'rect'}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              showGrid={!circular}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-white/60">
              {__('No image to crop yet — paste an image URL first.')}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-[12px]">
          <span className="w-12 shrink-0 text-[var(--text-secondary)]">{__('Zoom')}</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
          <span className="w-10 shrink-0 text-right font-mono text-[11px] text-[var(--text-muted)]">
            {zoom.toFixed(2)}×
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-1 text-[12px]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-8 items-center rounded-md border border-[var(--border-default)] px-3 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            {__('Cancel')}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!src || !croppedAreaPixels || busy}
            className="inline-flex h-8 items-center rounded-md bg-[var(--accent)] px-3 font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {busy ? __('Applying…') : __('Apply crop')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

/**
 * Draws the requested crop region of `src` onto an offscreen canvas
 * and exports a data URI. CORS: if `src` is a remote URL on a
 * different origin without permissive CORS headers, the canvas
 * becomes "tainted" and `toDataURL` throws — we catch and surface
 * the original src unchanged so the user at least doesn't lose
 * their image.
 */
async function renderCroppedImage(
  src: string,
  area: Area,
  mimeType: string,
  quality: number,
): Promise<string> {
  const image = await loadImage(src);

  const canvas = document.createElement('canvas');
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  );

  try {
    return canvas.toDataURL(mimeType, quality);
  } catch {
    return src;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // best-effort for remote URLs
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for cropping.'));
    img.src = src;
  });
}
