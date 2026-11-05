import { getConfig } from '@/bridge/apiClient';
import type { OnBehalfOf } from '@/bridge/types';

/**
 * The signature's owner when a team manager is editing someone else's
 * signature on their behalf (`IMGSIG_EDITOR_CONFIG.onBehalfOf`, 1.3.0);
 * null for the user's own signatures.
 */
export function onBehalfOf(): OnBehalfOf | null {
  try {
    const owner = getConfig().onBehalfOf;
    return owner && typeof owner.userId === 'number' && owner.userId > 0 ? owner : null;
  } catch {
    return null;
  }
}
