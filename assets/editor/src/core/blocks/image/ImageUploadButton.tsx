import { useRef, useState, type FC } from 'react';
import { Upload } from 'lucide-react';
import { isUploadEnabled } from '@/bridge/apiClient';
import { __ } from '@/i18n/helpers';
import { useToastStore } from '@/stores/toastStore';
import { ACCEPTED_IMAGE_TYPES, optimizeAndUpload } from '@/services/imageOptimize';
import { uploadErrorMessage } from '@/services/uploads';

export interface UploadedImageInfo {
  width: number;
  height: number;
  mime?: string;
  /** The optimised bytes that were uploaded (lets callers post-process without a re-download). */
  blob?: Blob;
}

interface Props {
  /** CSS px width the image is shown at — the upload is optimised for it. */
  displayWidth: number;
  /** Centre-crop to a square. */
  square?: boolean;
  /** Apply a circular alpha mask (implies square). */
  circular?: boolean;
  filenameBase: string;
  onUploaded: (url: string, size: UploadedImageInfo) => void;
  /** Button text. Default "Upload". */
  label?: string;
}

/**
 * "Upload" button for image fields. Opens a file picker, optimises the
 * file through `services/imageOptimize` (≤ 2× display width, cap
 * 1200 px, PNG / JPEG choice, GIFs untouched) and uploads it through
 * `/upload/*`. Hidden in URL-only mode — pasting a URL keeps working.
 */
export const ImageUploadButton: FC<Props> = ({
  displayWidth,
  square,
  circular,
  filenameBase,
  onUploaded,
  label,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const showToast = useToastStore((s) => s.show);

  if (!isUploadEnabled()) return null;

  const onPick = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBusy(true);
    try {
      const { asset, image } = await optimizeAndUpload(file, {
        displayWidth,
        square,
        mask: circular ? { shape: 'circle' } : undefined,
        filenameBase,
      });
      onUploaded(asset.url, {
        width: image.width,
        height: image.height,
        mime: image.mime,
        blob: image.blob,
      });
      showToast(__('Image uploaded.'), 'success');
      for (const warning of image.warnings) showToast(warning, 'info', 8000);
    } catch (e) {
      showToast(__('Could not upload the image: %s', uploadErrorMessage(e)), 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title={__('Upload an image from your computer')}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-60"
      >
        <Upload size={12} />
        {busy ? __('Uploading…') : (label ?? __('Upload'))}
      </button>
    </>
  );
};
