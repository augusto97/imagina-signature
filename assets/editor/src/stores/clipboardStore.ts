import { create } from 'zustand';
import type { Block } from '@/core/schema/blocks';

/** localStorage key holding the last copied block (per browser, all signatures). */
export const BLOCK_CLIPBOARD_STORAGE_KEY = 'imgsig_block_clipboard';

interface StoredClipboard {
  v: 1;
  block: Block;
  copied_at: string;
}

function isBlockLike(value: unknown): value is Block {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function readStorage(): Block | null {
  try {
    const raw = window.localStorage.getItem(BLOCK_CLIPBOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredClipboard> | null;
    return parsed && parsed.v === 1 && isBlockLike(parsed.block) ? parsed.block : null;
  } catch {
    return null;
  }
}

function writeStorage(block: Block): void {
  try {
    const payload: StoredClipboard = { v: 1, block, copied_at: new Date().toISOString() };
    window.localStorage.setItem(BLOCK_CLIPBOARD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode / quota / blocked storage: the in-memory copy still works.
  }
}

/**
 * Internal block clipboard behind Ctrl/Cmd+C / Ctrl/Cmd+V on the
 * canvas.
 *
 * Kept separate from the OS clipboard (which holds text / HTML, and
 * which the browser only lets us read with a permission prompt). The
 * copy is mirrored to localStorage so a block copied in one signature
 * can be pasted into another one — even in another tab. Reads prefer
 * localStorage (latest copy from any tab) and fall back to memory when
 * storage is unavailable. The stored block keeps its original ids;
 * paste regenerates them (see `schemaStore.pasteBlock`).
 */
interface ClipboardState {
  block: Block | null;
  copy: (block: Block) => void;
  read: () => Block | null;
  clear: () => void;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  block: null,

  copy: (block) => {
    const snapshot = JSON.parse(JSON.stringify(block)) as Block;
    writeStorage(snapshot);
    set({ block: snapshot });
  },

  read: () => readStorage() ?? get().block,

  clear: () => {
    try {
      window.localStorage.removeItem(BLOCK_CLIPBOARD_STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ block: null });
  },
}));
