// Tiny `fetch`-based API client used by both bundles.
// We intentionally avoid `@wordpress/api-fetch` here to keep the shared
// module dependency-free for tests; the editor bundle wraps this with
// the WP middlewares.

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  headers?: Record<string, string>;
}

function getBootstrap(): {
  apiUrl: string;
  nonce: string;
} {
  if (typeof window === 'undefined' || !window.ImaginaSignaturesData) {
    throw new Error('ImaginaSignaturesData bootstrap is missing.');
  }
  return window.ImaginaSignaturesData;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { apiUrl, nonce } = getBootstrap();
  const url = apiUrl.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);

  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      'X-WP-Nonce': nonce,
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  const parsed = text.length > 0 ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw Object.assign(new Error('Request failed'), { status: response.status, body: parsed });
  }

  return parsed as T;
}

export const apiGet = <T>(path: string) => apiRequest<T>(path, { method: 'GET' });
export const apiPost = <T>(path: string, body?: unknown) =>
  apiRequest<T>(path, { method: 'POST', body });
export const apiPatch = <T>(path: string, body?: unknown) =>
  apiRequest<T>(path, { method: 'PATCH', body });
export const apiDelete = <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' });
