import { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Button } from '../components/ui/Button';
import { __ } from '../i18n/helpers';
import { uploadApi } from '../api/upload';
import { prepareImage } from '../utils/image';
import { pushToast } from '../components/ui/Toaster';
import type { AssetRecord } from '@shared/types';

interface Props {
  currentUrl?: string;
  onUploaded: (asset: AssetRecord) => void;
}

export function ImageUploader({ currentUrl, onUploaded }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      const prepared = await prepareImage(file);
      const init = await uploadApi.init({
        mime_type: prepared.mime,
        size_bytes: prepared.size,
        filename: file.name,
        hash_sha256: prepared.hash,
      });

      if (init.method === 'direct') {
        const formData = new FormData();
        formData.append('file', new File([prepared.blob], file.name, { type: prepared.mime }));
        const response = await fetch(init.upload_url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-WP-Nonce': window.ImaginaSignaturesData.nonce },
          body: formData,
        });
        if (!response.ok) {
          throw new Error(__('Upload failed'));
        }
        const asset = (await response.json()) as AssetRecord;
        onUploaded(asset);
      } else {
        const response = await fetch(init.upload_url, {
          method: 'PUT',
          headers: init.headers,
          body: prepared.blob,
        });
        if (!response.ok) {
          throw new Error(__('Storage upload failed'));
        }
        const asset = await uploadApi.finalize({
          storage_key: init.storage_key,
          mime_type: prepared.mime,
          size_bytes: prepared.size,
          width: prepared.width,
          height: prepared.height,
          hash_sha256: prepared.hash,
        });
        onUploaded(asset);
      }

      pushToast(__('Image uploaded.'), 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : __('Upload failed');
      pushToast(message, 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      {currentUrl && (
        <div className="is-mb-2">
          <img
            src={currentUrl}
            alt=""
            className="is-max-w-full is-h-auto is-rounded is-border is-border-slate-200"
            style={{ maxHeight: '120px' }}
          />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="is-hidden"
        onChange={(event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (file) handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {currentUrl ? __('Replace image') : __('Upload image')}
      </Button>
    </div>
  );
}
