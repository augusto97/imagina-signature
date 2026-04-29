// Shared API client. Uses `@wordpress/api-fetch` so nonce/credentials match
// WordPress core. Both editor and admin bundles import from here.

import apiFetch from '@wordpress/api-fetch';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  if (typeof window === 'undefined' || !window.ImaginaSignaturesData) {
    throw new Error('ImaginaSignaturesData bootstrap is missing.');
  }
  apiFetch.use(apiFetch.createNonceMiddleware(window.ImaginaSignaturesData.nonce));
  apiFetch.use(apiFetch.createRootURLMiddleware(window.ImaginaSignaturesData.apiUrl));
  configured = true;
}

export async function apiGet<T>(path: string): Promise<T> {
  ensureConfigured();
  return apiFetch({ path, method: 'GET' }) as Promise<T>;
}

export async function apiPost<T>(path: string, data?: unknown): Promise<T> {
  ensureConfigured();
  return apiFetch({ path, method: 'POST', data: data as Record<string, unknown> }) as Promise<T>;
}

export async function apiPatch<T>(path: string, data?: unknown): Promise<T> {
  ensureConfigured();
  return apiFetch({ path, method: 'PATCH', data: data as Record<string, unknown> }) as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  ensureConfigured();
  return apiFetch({ path, method: 'DELETE' }) as Promise<T>;
}
