import { getConfig } from '@/bridge/apiClient';

/**
 * Brand swatches configured by the site admin
 * (`IMGSIG_EDITOR_CONFIG.brandPalette`). Empty when the bootstrap is
 * unavailable (preview / tests) — callers simply omit the swatches.
 */
export function brandPalette(): string[] {
  try {
    return getConfig().brandPalette ?? [];
  } catch {
    return [];
  }
}
