import { useEffect, useMemo, useRef, useState, type DragEvent, type FC, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ImageOff,
  Images,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  CloudUpload,
} from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { ConfirmDialog } from '@/editor/modals/ConfirmDialog';
import { isUploadEnabled } from '@/bridge/apiClient';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { useSchemaStore } from '@/stores/schemaStore';
import { useToastStore } from '@/stores/toastStore';
import { ACCEPTED_IMAGE_TYPES, optimizeAndUpload } from '@/services/imageOptimize';
import { probeImageSize } from '@/services/imageDecode';
import { slugFilename, uploadErrorMessage } from '@/services/uploads';
import {
  assetFilename,
  filterAssets,
  formatBytes,
  formatLabel,
  type LibraryAsset,
} from '@/services/assets';
import { useAssetLibrary } from '@/services/useAssetLibrary';

/** What the library hands back to its caller. */
export interface AssetSelection {
  /** Public URL to reference in the signature. */
  url: string;
  /** Intrinsic pixel size, when known. */
  width?: number;
  height?: number;
  /** Library asset id (absent for a pasted URL). */
  assetId?: number;
  mime?: string;
}

export interface AssetLibraryModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called with the chosen image ("Use image", double-click, a pasted
   * URL). The modal then calls `onClose` itself.
   */
  onSelect: (selection: AssetSelection) => void;
  /** Dialog title. Default "Image library". */
  title?: string;
  /**
   * CSS px width the chosen image will be displayed at. Images uploaded
   * from the drop zone are optimised for it (≤ 2×, cap 1200 px).
   * Default 600.
   */
  displayWidth?: number;
  /** Fallback base filename for uploads. Default "image". */
  filenameBase?: string;
  /** Offer the "paste an image URL" field. Default true. */
  allowUrl?: boolean;
  /** Pre-fills the URL field (e.g. the block's current external URL). */
  initialUrl?: string;
}

interface UploadJob {
  key: string;
  name: string;
  status: 'working' | 'done' | 'error';
  message?: string;
}

/**
 * Asset library — the user's uploaded images in a searchable grid with
 * a multi-file drop zone, delete (with confirmation) and "Use image".
 * In URL-only storage mode the upload zone is replaced by a notice and
 * pasting a URL keeps working.
 *
 * Reusable: anything that needs an image (blocks, brand kit logo…)
 * renders it with `open` / `onClose` / `onSelect`.
 */
export const AssetLibraryModal: FC<AssetLibraryModalProps> = ({
  open,
  onClose,
  onSelect,
  title,
  displayWidth = 600,
  filenameBase = 'image',
  allowUrl = true,
  initialUrl = '',
}) => {
  const uploadsEnabled = isUploadEnabled();
  const library = useAssetLibrary(open);
  const showToast = useToastStore((s) => s.show);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<LibraryAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [url, setUrl] = useState('');
  const [urlState, setUrlState] = useState<{ busy: boolean; error: string | null; unverified: boolean }>(
    { busy: false, error: null, unverified: false },
  );
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedId(null);
    setJobs([]);
    setDragActive(false);
    setUrl(/^https?:\/\//i.test(initialUrl) ? initialUrl : '');
    setUrlState({ busy: false, error: null, unverified: false });
  }, [open, initialUrl]);

  const visible = useMemo(() => filterAssets(library.items, search), [library.items, search]);
  const selected = library.items.find((a) => a.id === selectedId) ?? null;
  const working = jobs.some((j) => j.status === 'working');

  const choose = (asset: LibraryAsset): void => {
    onSelect({
      url: asset.url,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      assetId: asset.id,
      mime: asset.mime || undefined,
    });
    onClose();
  };

  const updateJob = (key: string, patch: Partial<UploadJob>): void =>
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  const uploadFiles = async (files: File[]): Promise<void> => {
    if (!uploadsEnabled || files.length === 0) return;
    const stamp = Date.now();
    const queued: UploadJob[] = files.map((f, i) => ({
      key: `${stamp}-${i}`,
      name: f.name || __('Image'),
      status: 'working',
    }));
    setJobs((prev) => [...queued, ...prev.filter((j) => j.status !== 'done')].slice(0, 12));

    let last: LibraryAsset | null = null;
    // One at a time: friendlier to the per-minute upload rate limit.
    for (const [i, file] of files.entries()) {
      const key = queued[i]!.key;
      try {
        const base = slugFilename(file.name.replace(/\.[a-z0-9]+$/i, ''), filenameBase);
        const { asset, image } = await optimizeAndUpload(file, {
          displayWidth,
          filenameBase: base,
        });
        const entry: LibraryAsset = {
          id: asset.id,
          url: asset.url,
          mime: image.mime,
          size: image.blob.size,
          width: image.width || null,
          height: image.height || null,
          createdAt: '',
          filename: assetFilename(asset.url),
        };
        library.add(entry);
        last = entry;
        for (const warning of image.warnings) showToast(warning, 'info', 8000);
        updateJob(key, { status: 'done' });
      } catch (e) {
        updateJob(key, { status: 'error', message: uploadErrorMessage(e) });
      }
    }
    if (last) {
      setSearch('');
      setSelectedId(last.id);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    if (!uploadsEnabled) return;
    e.preventDefault();
    setDragActive(false);
    void uploadFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
    if (!uploadsEnabled || !Array.from(e.dataTransfer.types ?? []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragActive) setDragActive(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const doDelete = async (): Promise<void> => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setDeleting(true);
    try {
      await library.remove(target.id);
      if (selectedId === target.id) setSelectedId(null);
      showToast(__('Image deleted.'), 'success');
      setConfirmDelete(null);
    } catch (e) {
      showToast(__('Could not delete the image: %s', uploadErrorMessage(e)), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const submitUrl = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const value = url.trim();
    if (!/^https?:\/\/[^\s]+$/i.test(value)) {
      setUrlState({ busy: false, error: __('Enter a full image URL starting with https://'), unverified: false });
      return;
    }
    if (urlState.unverified) {
      onSelect({ url: value });
      onClose();
      return;
    }
    setUrlState({ busy: true, error: null, unverified: false });
    const size = await probeImageSize(value, 6000);
    if (!size) {
      setUrlState({
        busy: false,
        error: __('This image could not be loaded. Check the address — recipients will not see it either if it is wrong.'),
        unverified: true,
      });
      return;
    }
    setUrlState({ busy: false, error: null, unverified: false });
    onSelect({ url: value, width: size.width, height: size.height });
    onClose();
  };

  const usedInSignature = (asset: LibraryAsset): boolean => {
    try {
      return JSON.stringify(useSchemaStore.getState().schema.blocks).includes(asset.url);
    } catch {
      return false;
    }
  };

  return (
    <Modal open={open} title={title ?? __('Image library')} onClose={onClose} width={780}>
      <div
        className="relative flex flex-col gap-3"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {uploadsEnabled ? (
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors',
              dragActive
                ? 'border-[var(--accent)] bg-[var(--bg-selected)]'
                : 'border-[var(--border-strong)] bg-[var(--bg-panel-soft)]',
            )}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-selected)] text-[var(--accent)]">
              <CloudUpload size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-[var(--text-primary)]">
                {dragActive ? __('Drop to upload') : __('Drag images here to upload them')}
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                {__('PNG, JPG, WebP or GIF. Images are resized and compressed for email automatically.')}
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPTED_IMAGE_TYPES}
              className="hidden"
              data-testid="asset-library-file-input"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                void uploadFiles(files);
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)]"
            >
              <CloudUpload size={13} />
              {__('Choose files')}
            </button>
          </div>
        ) : (
          <div
            role="note"
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {__(
                'Uploads are disabled on this site (URL-only storage). Paste the address of an image hosted elsewhere below.',
              )}
            </span>
          </div>
        )}

        {jobs.length > 0 && (
          <ul className="flex flex-col gap-1" aria-live="polite">
            {jobs.map((job) => (
              <li
                key={job.key}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1 text-[11.5px]',
                  job.status === 'error'
                    ? 'bg-red-50 text-red-800'
                    : 'bg-[var(--bg-panel-soft)] text-[var(--text-secondary)]',
                )}
              >
                {job.status === 'working' && <Loader2 size={12} className="animate-spin" />}
                {job.status === 'done' && <Check size={12} className="text-[var(--success)]" />}
                {job.status === 'error' && <AlertTriangle size={12} />}
                <span className="truncate font-medium">{job.name}</span>
                <span className="ml-auto shrink-0">
                  {job.status === 'working'
                    ? __('Optimising and uploading…')
                    : job.status === 'done'
                      ? __('Uploaded')
                      : job.message}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="search"
              aria-label={__('Search images')}
              placeholder={__('Search by name, format or size…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!pl-9"
            />
          </div>
          <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
            {library.status !== 'ready'
              ? ''
              : library.items.length === 1
                ? __('1 image')
                : __('%s images', String(library.items.length))}
          </span>
        </div>

        <div className="max-h-[44vh] min-h-[160px] overflow-y-auto rounded-md">
          {library.status === 'loading' && <GridSkeleton />}

          {library.status === 'error' && (
            <div className="flex flex-col items-center gap-2 rounded-md bg-[var(--bg-panel-soft)] p-6 text-center text-[12px] text-red-700">
              <p>{__('Could not load your images: %s', library.error ?? '')}</p>
              <button
                type="button"
                onClick={library.reload}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-2.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                <RefreshCw size={12} />
                {__('Retry')}
              </button>
            </div>
          )}

          {library.status === 'ready' && library.items.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-md bg-[var(--bg-panel-soft)] px-6 py-10 text-center">
              <Images size={22} className="text-[var(--text-muted)]" />
              <p className="text-[12.5px] font-medium text-[var(--text-primary)]">
                {__('No images yet')}
              </p>
              <p className="max-w-sm text-[11.5px] text-[var(--text-muted)]">
                {uploadsEnabled
                  ? __('Upload a logo, a photo or a banner once and reuse it in any signature.')
                  : __('Images uploaded before uploads were disabled would appear here.')}
              </p>
            </div>
          )}

          {library.status === 'ready' && library.items.length > 0 && visible.length === 0 && (
            <p className="rounded-md bg-[var(--bg-panel-soft)] p-6 text-center text-[12px] text-[var(--text-muted)]">
              {__('No images match “%s”.', search)}
            </p>
          )}

          {library.status === 'ready' && visible.length > 0 && (
            <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-label={__('Your images')}>
              {visible.map((asset) => (
                <li key={asset.id}>
                  <AssetTile
                    asset={asset}
                    selected={asset.id === selectedId}
                    onSelect={() => setSelectedId(asset.id)}
                    onUse={() => choose(asset)}
                    onDelete={() => setConfirmDelete(asset)}
                  />
                </li>
              ))}
            </ul>
          )}

          {library.status === 'ready' && library.hasMore && search.trim() === '' && (
            <div className="flex justify-center pt-3">
              <button
                type="button"
                onClick={library.loadMore}
                disabled={library.loadingMore}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-default)] px-3 text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
              >
                {library.loadingMore && <Loader2 size={12} className="animate-spin" />}
                {library.loadingMore ? __('Loading…') : __('Load more')}
              </button>
            </div>
          )}
        </div>

        {allowUrl && (
          <form
            onSubmit={(e) => void submitUrl(e)}
            className="flex flex-col gap-1 border-t border-[var(--border-subtle)] pt-3"
          >
            <span className="is-section-label">{__('Or use an image URL')}</span>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  type="url"
                  aria-label={__('Image URL')}
                  placeholder="https://"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (urlState.error || urlState.unverified) {
                      setUrlState({ busy: false, error: null, unverified: false });
                    }
                  }}
                  className="!pl-9"
                />
              </div>
              <button
                type="submit"
                disabled={url.trim() === '' || urlState.busy}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-default)] px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {urlState.busy && <Loader2 size={12} className="animate-spin" />}
                {urlState.unverified ? __('Use anyway') : __('Use URL')}
              </button>
            </div>
            {urlState.error && (
              <p role="alert" className="text-[11px] text-amber-700">
                {urlState.error}
              </p>
            )}
          </form>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
          <p className="min-w-0 truncate text-[11.5px] text-[var(--text-muted)]">
            {selected ? `${selected.filename} · ${describeAsset(selected)}` : __('Select an image, or double-click to use it.')}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center rounded-md border border-[var(--border-default)] px-3 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              {__('Cancel')}
            </button>
            <button
              type="button"
              disabled={!selected || working}
              onClick={() => selected && choose(selected)}
              className="inline-flex h-8 items-center rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {__('Use image')}
            </button>
          </div>
        </div>

        {dragActive && (
          <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-dashed border-[var(--accent)] bg-blue-50/60" />
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={__('Delete this image?')}
        confirmLabel={deleting ? __('Deleting…') : __('Delete')}
        tone="danger"
        onCancel={() => (deleting ? undefined : setConfirmDelete(null))}
        onConfirm={() => void doDelete()}
      >
        <p>
          {__('It is removed from your library and from storage. Signatures that still use it will show a broken image.')}
        </p>
        {confirmDelete && usedInSignature(confirmDelete) && (
          <p className="mt-1.5 font-medium text-red-700">
            {__('This signature uses this image right now.')}
          </p>
        )}
      </ConfirmDialog>
    </Modal>
  );
};

/** `PNG · 24 KB · 240 × 240` */
function describeAsset(asset: LibraryAsset): string {
  const parts = [formatLabel(asset.mime).toUpperCase(), formatBytes(asset.size)];
  if (asset.width && asset.height) parts.push(`${asset.width} × ${asset.height}`);
  return parts.filter(Boolean).join(' · ');
}

const AssetTile: FC<{
  asset: LibraryAsset;
  selected: boolean;
  onSelect: () => void;
  onUse: () => void;
  onDelete: () => void;
}> = ({ asset, selected, onSelect, onUse, onDelete }) => {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-md border bg-[var(--bg-panel)] transition-shadow',
        selected
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]'
          : 'border-[var(--border-default)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onUse}
        aria-pressed={selected}
        aria-label={asset.filename}
        className="flex flex-col text-left"
      >
        <span
          className="flex aspect-square w-full items-center justify-center overflow-hidden"
          style={{
            backgroundColor: '#f8fafc',
            backgroundImage:
              'linear-gradient(45deg,#eef1f5 25%,transparent 25%),linear-gradient(-45deg,#eef1f5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef1f5 75%),linear-gradient(-45deg,transparent 75%,#eef1f5 75%)',
            backgroundSize: '14px 14px',
            backgroundPosition: '0 0,0 7px,7px -7px,-7px 0',
          }}
        >
          {broken ? (
            <ImageOff size={20} className="text-[var(--text-muted)]" />
          ) : (
            <img
              src={asset.url}
              alt=""
              loading="lazy"
              draggable={false}
              onError={() => setBroken(true)}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </span>
        <span className="flex flex-col gap-0.5 border-t border-[var(--border-subtle)] px-2 py-1.5">
          <span className="truncate text-[11px] font-medium text-[var(--text-primary)]" title={asset.filename}>
            {asset.filename}
          </span>
          <span className="truncate text-[10px] text-[var(--text-muted)]">{describeAsset(asset)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={__('Delete image')}
        aria-label={__('Delete image')}
        className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-[var(--text-secondary)] opacity-0 shadow-sm transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
      {selected && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
          <Check size={12} />
        </span>
      )}
    </div>
  );
};

const GridSkeleton: FC = () => (
  <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-hidden>
    {Array.from({ length: 8 }, (_, i) => (
      <li key={i} className="overflow-hidden rounded-md border border-[var(--border-subtle)]">
        <div className="aspect-square w-full animate-pulse bg-[var(--bg-hover)]" />
        <div className="space-y-1 px-2 py-1.5">
          <div className="h-2.5 w-3/4 animate-pulse rounded bg-[var(--bg-hover)]" />
          <div className="h-2 w-1/2 animate-pulse rounded bg-[var(--bg-hover)]" />
        </div>
      </li>
    ))}
  </ul>
);
