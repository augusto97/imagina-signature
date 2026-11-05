import { useState, type FC } from 'react';
import { Images } from 'lucide-react';
import { __ } from '@/i18n/helpers';
import { AssetLibraryModal } from '@/editor/modals/AssetLibraryModal';
import { ImageUploadButton } from './ImageUploadButton';

/** An image chosen through the library, an upload or the library's URL field. */
export interface ImagePick {
  url: string;
  /** Intrinsic pixel size when known. */
  width?: number;
  height?: number;
  /** The uploaded bytes (uploads only). */
  blob?: Blob;
  /** `url` = an external address pasted in the library (not hosted by us). */
  source: 'library' | 'upload' | 'url';
}

interface Props {
  label?: string;
  /** URL shown in the text field. */
  value: string;
  placeholder?: string;
  /** The user typed / pasted a URL into the field. */
  onUrlChange: (url: string) => void;
  /** The user chose an image from the library or uploaded one. */
  onPick: (pick: ImagePick) => void;
  /** CSS px width the image is shown at (upload optimisation target). */
  displayWidth: number;
  filenameBase: string;
}

/**
 * Image source control shared by Image, Avatar and Banner: URL field +
 * "Library" (asset library modal: pick, upload many, delete, paste a
 * URL) + "Upload" (one file, optimised). Upload is hidden in URL-only
 * storage mode; the library still opens (existing assets + URL field).
 */
export const ImageSourceField: FC<Props> = ({
  label,
  value,
  placeholder,
  onUrlChange,
  onPick,
  displayWidth,
  filenameBase,
}) => {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const fieldLabel = label ?? __('Image URL');

  return (
    <div className="flex flex-col gap-1.5">
      <span className="is-section-label block">{fieldLabel}</span>
      <input
        type="url"
        aria-label={fieldLabel}
        className="w-full min-w-0"
        value={value}
        placeholder={placeholder ?? 'https://'}
        onChange={(e) => onUrlChange(e.target.value)}
      />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          title={__('Choose from your image library')}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Images size={12} />
          {__('Library')}
        </button>
        <ImageUploadButton
          displayWidth={displayWidth}
          filenameBase={filenameBase}
          onUploaded={(url, info) =>
            onPick({
              url,
              width: info.width || undefined,
              height: info.height || undefined,
              blob: info.blob,
              source: 'upload',
            })
          }
        />
      </div>
      <AssetLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        displayWidth={displayWidth}
        filenameBase={filenameBase}
        onSelect={(selection) =>
          onPick({
            url: selection.url,
            width: selection.width,
            height: selection.height,
            source: selection.assetId ? 'library' : 'url',
          })
        }
      />
    </div>
  );
};
