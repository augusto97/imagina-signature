// Browser-side image utilities. Compression uses
// `browser-image-compression` when available; otherwise the file is
// passed through unchanged. SHA-256 is computed via SubtleCrypto.

export interface ImageInfo {
  blob: Blob;
  mime: string;
  size: number;
  width: number;
  height: number;
  hash: string;
}

async function loadCompressor(): Promise<((file: File, options: Record<string, unknown>) => Promise<File>) | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional dep.
    const mod = await import(/* @vite-ignore */ 'browser-image-compression');
    return (mod.default ?? mod) as (file: File, options: Record<string, unknown>) => Promise<File>;
  } catch {
    return null;
  }
}

export async function readImageInfo(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (event) => {
      URL.revokeObjectURL(url);
      reject(event);
    };
    img.src = url;
  });
}

export async function sha256(blob: Blob): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function prepareImage(file: File, options?: { maxWidth?: number; maxBytes?: number }): Promise<ImageInfo> {
  const maxWidth = options?.maxWidth ?? 1024;
  const maxBytes = options?.maxBytes ?? 1.5 * 1024 * 1024;

  let blob: Blob = file;
  if (file.size > maxBytes) {
    const compressor = await loadCompressor();
    if (compressor) {
      try {
        blob = await compressor(file, {
          maxSizeMB: maxBytes / (1024 * 1024),
          maxWidthOrHeight: maxWidth,
          useWebWorker: true,
        });
      } catch {
        // fall through with the original blob
      }
    }
  }

  const dims = await readImageInfo(blob).catch(() => ({ width: 0, height: 0 }));
  const hash = await sha256(blob).catch(() => '');

  return {
    blob,
    mime: blob.type || file.type || 'application/octet-stream',
    size: blob.size,
    width: dims.width,
    height: dims.height,
    hash,
  };
}
