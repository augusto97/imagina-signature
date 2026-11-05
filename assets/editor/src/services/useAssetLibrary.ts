import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadErrorMessage } from '@/services/uploads';
import {
  ASSET_PAGE_SIZE,
  deleteAsset,
  fetchAssetPage,
  type LibraryAsset,
} from '@/services/assets';

export type AssetLibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AssetLibrary {
  items: LibraryAsset[];
  status: AssetLibraryStatus;
  /** Message of the last failed load. */
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** Reloads from the first page. */
  reload: () => void;
  /** Appends the next page. */
  loadMore: () => void;
  /**
   * Deletes an asset on the server, then drops it from the list.
   * Rejects (list untouched) when the server refuses.
   */
  remove: (id: number) => Promise<void>;
  /** Puts a freshly uploaded asset at the top (deduplicated by id). */
  add: (asset: LibraryAsset) => void;
}

/**
 * The user's image assets, paginated. Loads page 1 when `enabled`
 * becomes true (e.g. the library modal opens).
 *
 * Pagination tracks how many server rows the list covers (`offset`),
 * adjusted by local adds / deletes, so "Load more" after uploading or
 * deleting neither skips nor repeats rows (results are de-duplicated
 * by id).
 */
export function useAssetLibrary(enabled: boolean, perPage = ASSET_PAGE_SIZE): AssetLibrary {
  const [items, setItems] = useState<LibraryAsset[]>([]);
  const [status, setStatus] = useState<AssetLibraryStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const offset = useRef(0);
  const requestId = useRef(0);
  const itemsRef = useRef<LibraryAsset[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    if (!enabled) return undefined;
    // The counter is bookkeeping, not a DOM node: bumping it in the
    // cleanup is exactly the intent (invalidate in-flight responses).
    const counter = requestId;
    const id = ++counter.current;
    setStatus('loading');
    setError(null);
    setLoadingMore(false);
    fetchAssetPage(1, perPage)
      .then((page) => {
        if (id !== counter.current) return;
        offset.current = page.rawCount;
        setItems(page.items);
        setHasMore(page.hasMore);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (id !== counter.current) return;
        setError(uploadErrorMessage(e));
        setStatus('error');
      });
    return () => {
      // Invalidate in-flight responses (closed / re-opened / reloaded).
      counter.current++;
    };
  }, [enabled, perPage, reloadToken]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const id = requestId.current;
    const page = Math.floor(Math.max(0, offset.current) / perPage) + 1;
    setLoadingMore(true);
    fetchAssetPage(page, perPage)
      .then((result) => {
        if (id !== requestId.current) return;
        offset.current = (page - 1) * perPage + result.rawCount;
        setItems((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...result.items.filter((a) => !seen.has(a.id))];
        });
        setHasMore(result.hasMore);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(uploadErrorMessage(e));
      })
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false);
      });
  }, [hasMore, loadingMore, perPage]);

  const remove = useCallback(async (assetId: number) => {
    await deleteAsset(assetId);
    if (itemsRef.current.some((a) => a.id === assetId)) {
      offset.current = Math.max(0, offset.current - 1);
      itemsRef.current = itemsRef.current.filter((a) => a.id !== assetId);
    }
    setItems((prev) => prev.filter((a) => a.id !== assetId));
  }, []);

  const add = useCallback((asset: LibraryAsset) => {
    if (!itemsRef.current.some((a) => a.id === asset.id)) offset.current += 1;
    // Keep the ref current for several adds within one tick.
    itemsRef.current = [asset, ...itemsRef.current.filter((a) => a.id !== asset.id)];
    setItems((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)]);
  }, []);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return { items, status, error, hasMore, loadingMore, reload, loadMore, remove, add };
}
