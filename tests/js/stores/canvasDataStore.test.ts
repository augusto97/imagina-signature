import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_DATA_STORAGE_PREFIX,
  canvasDataStorageKey,
  readShowDataPreference,
  useCanvasDataStore,
} from '@/stores/canvasDataStore';

const config = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
  .IMGSIG_EDITOR_CONFIG;

describe('canvasDataStore (Show data / Show fields)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useCanvasDataStore.setState({ showData: true });
  });

  afterEach(() => {
    config.userId = 1;
    vi.restoreAllMocks();
  });

  it('defaults to showing data', () => {
    expect(readShowDataPreference()).toBe(true);
    expect(useCanvasDataStore.getState().showData).toBe(true);
  });

  it('keys the preference by WordPress user', () => {
    expect(canvasDataStorageKey()).toBe(`${CANVAS_DATA_STORAGE_PREFIX}1`);
    expect(canvasDataStorageKey(42)).toBe(`${CANVAS_DATA_STORAGE_PREFIX}42`);
  });

  it('persists the choice for the current user only', () => {
    useCanvasDataStore.getState().setShowData(false);
    expect(useCanvasDataStore.getState().showData).toBe(false);
    expect(window.localStorage.getItem(canvasDataStorageKey(1))).toBe('0');
    expect(readShowDataPreference(1)).toBe(false);
    expect(readShowDataPreference(2)).toBe(true);

    config.userId = 2;
    useCanvasDataStore.setState({ showData: true });
    useCanvasDataStore.getState().setShowData(false);
    useCanvasDataStore.getState().setShowData(true);
    expect(window.localStorage.getItem(canvasDataStorageKey(2))).toBe('1');
    expect(readShowDataPreference(1)).toBe(false);
  });

  it('toggles', () => {
    useCanvasDataStore.getState().toggleShowData();
    expect(useCanvasDataStore.getState().showData).toBe(false);
    useCanvasDataStore.getState().toggleShowData();
    expect(useCanvasDataStore.getState().showData).toBe(true);
    expect(readShowDataPreference()).toBe(true);
  });

  it('falls back to the default when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readShowDataPreference()).toBe(true);
    expect(() => useCanvasDataStore.getState().setShowData(false)).not.toThrow();
    expect(useCanvasDataStore.getState().showData).toBe(false);
  });

  it('treats unexpected stored values as the default', () => {
    window.localStorage.setItem(canvasDataStorageKey(), 'garbage');
    expect(readShowDataPreference()).toBe(true);
  });
});
