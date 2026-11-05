import { create } from 'zustand';
import { getConfig } from '@/bridge/apiClient';

/**
 * Canvas "Show data / Show fields" toggle.
 *
 *  - `showData: true` (default) — blocks render with their
 *    `{{variables}}` resolved (see `editor/canvas/liveData.ts`).
 *  - `showData: false` — blocks render the raw `{{tokens}}`.
 *
 * Purely visual: the schema always keeps the tokens. The choice is
 * remembered per WordPress user in localStorage (best effort — private
 * mode / blocked storage just falls back to the default).
 */

/** localStorage key prefix; the user id is appended. */
export const CANVAS_DATA_STORAGE_PREFIX = 'imgsig:canvas-show-data:';

/** Storage key for the current (or given) user. */
export function canvasDataStorageKey(userId?: number): string {
  let id = userId;
  if (id === undefined) {
    try {
      id = getConfig().userId;
    } catch {
      id = 0;
    }
  }
  return `${CANVAS_DATA_STORAGE_PREFIX}${Number.isFinite(id) ? id : 0}`;
}

/** The remembered preference, or true when nothing (valid) is stored. */
export function readShowDataPreference(userId?: number): boolean {
  try {
    return window.localStorage.getItem(canvasDataStorageKey(userId)) !== '0';
  } catch {
    return true;
  }
}

function writeShowDataPreference(showData: boolean): void {
  try {
    window.localStorage.setItem(canvasDataStorageKey(), showData ? '1' : '0');
  } catch {
    // Storage unavailable — the choice just isn't remembered.
  }
}

interface CanvasDataState {
  showData: boolean;
  setShowData: (showData: boolean) => void;
  toggleShowData: () => void;
}

export const useCanvasDataStore = create<CanvasDataState>((set, get) => ({
  showData: readShowDataPreference(),

  setShowData: (showData) => {
    if (get().showData === showData) return;
    writeShowDataPreference(showData);
    set({ showData });
  },

  toggleShowData: () => get().setShowData(!get().showData),
}));
