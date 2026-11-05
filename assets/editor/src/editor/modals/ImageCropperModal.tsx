import { useCallback, useEffect, useState, type FC } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { __ } from '@/i18n/helpers';
import { loadImageForCanvas } from '@/services/imageDecode';
import { optimizeImageElement, uploadOptimizedImage } from '@/services/imageOptimize';
import { uploadErrorMessage } from '@/services/uploads';

function isGifSrc(src: string): boolean {
  if (!src) return false;
  const noQuery = src.split('?')[0]?.toLowerCase() ?? '';
  return noQuery.endsWith('.gif');
}

export interface CroppedImage {
  /** Public URL of the uploaded result. */
  url: string;
  /** Pixel size of the uploaded image. */
  width: number;
  height: number;
  /** The uploaded bytes (lets callers post-process without a re-download). */
  blob: Blob;
  mime: string;
}

interface Props {
  open: boolean;
  /** The image to crop. Can be a URL or a data URI. */
  src: string;
  /** Aspect ratio (width / height). 1 for avatar (square), undefined for free. */
  aspect?: number;
  /**
   * Produce a round image: a PNG with a true circular alpha mask, so
   * it is round everywhere — including Outlook, which ignores
   * `border-radius`.
   */
  circular?: boolean;
  /**
   * Shape of the crop overlay. Defaults to `round` when `circular`,
   * `rect` otherwise. Set `round` without `circular` to frame a round
   * avatar while uploading the unmasked square (the avatar block bakes
   * the mask itself).
   */
  cropShape?: 'round' | 'rect';
  /**
   * CSS width the image is displayed at in the signature. The output is
   * resized to at most 2× this (HiDPI), capped at 1200px.
   */
  displayWidth: number;
  /** Base name for the uploaded file (extension added automatically). */
  filenameBase?: string;
  onCancel: () => void;
  /** Receives the hosted result once the crop has been uploaded. */
  onConfirm: (result: CroppedImage) => void;
}

/**
 * Image cropper modal — wraps `react-easy-crop` with a sensible
 * editor-shell layout (centred crop area, zoom slider, Cancel / Save
 * footer).
 *
 * "Apply" renders a REAL image and uploads it (it used to write a
 * full-resolution base64 data URI into the schema, which Gmail /
 * Outlook.com don't display, and whose "circular" crop was only a
 * visual overlay — avatars still went out square):
 *
 *  - circular → PNG with a circular alpha mask;
 *  - otherwise optimised like every upload (`services/imageOptimize`):
 *    JPEG q 0.85, or PNG when the result has transparency;
 *  - resized so its pixel width ≤ 2× `displayWidth` (cap 1200px).
 */
export const ImageCropperModal: FC<Props> = ({
  open,
  src,
  aspect,
  circular,
  cropShape,
  displayWidth,
  filenameBase = 'image',
  onCancel,
  onConfirm,
}) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const round = (cropShape ?? (circular ? 'round' : 'rect')) === 'round';

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const apply = async (): Promise<void> => {
    if (!croppedAreaPixels || busy) return;
    setBusy(true);
    setError(null);
    try {
      const image = await loadImageForCanvas(src);
      const rendered = await optimizeImageElement(image, {
        crop: croppedAreaPixels,
        displayWidth,
        mask: circular ? { shape: 'circle' } : undefined,
      });
      const asset = await uploadOptimizedImage(rendered, filenameBase);
      onConfirm({
        url: asset.url,
        width: rendered.width,
        height: rendered.height,
        blob: rendered.blob,
        mime: rendered.mime,
      });
    } catch (e) {
      setError(uploadErrorMessage(e));
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
              cropShape={round ? 'round' : 'rect'}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              showGrid={!round}
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

        {isGifSrc(src) && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {__(
                'This is an animated GIF. Cropping flattens it to a single frame — the result will be a static image. Cancel and resize the original GIF in another tool if you want to keep the animation.',
              )}
            </span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-800"
          >
            {error}
          </div>
        )}

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
            onClick={() => void apply()}
            disabled={!src || !croppedAreaPixels || busy}
            className="inline-flex h-8 items-center rounded-md bg-[var(--accent)] px-3 font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {busy ? __('Uploading…') : __('Apply crop')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
