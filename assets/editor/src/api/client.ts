// Wrapper around `@shared/api-client` that uses `@wordpress/api-fetch` when
// available so nonce/middleware behavior matches WP core.

import { apiGet, apiPost, apiPatch, apiDelete } from '@shared/api-client';

export { apiGet, apiPost, apiPatch, apiDelete };
