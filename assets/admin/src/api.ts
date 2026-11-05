import { __ } from '@shared/i18n';
import { createRestNonceManager } from '@shared/restNonce';
import type { AdminConfig } from './types';

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly data: unknown;

  constructor(code: string, message: string, status: number, data: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export function getConfig(): AdminConfig {
  const config = (window as unknown as { IMGSIG_ADMIN_CONFIG?: AdminConfig })
    .IMGSIG_ADMIN_CONFIG;
  if (!config) {
    throw new Error('IMGSIG_ADMIN_CONFIG is missing — admin app loaded outside its host.');
  }
  return config;
}

interface ApiCallOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * REST nonce lifecycle (see `assets/shared/restNonce.ts`): refreshes
 * `IMGSIG_ADMIN_CONFIG.restNonce` in place on a nonce failure and
 * every 10 h, so a listing left open overnight keeps working.
 */
const nonceManager = createRestNonceManager(getConfig);

/** Fetch a fresh REST nonce now. Resolves null when WordPress refused. */
export function refreshRestNonce(): Promise<string | null> {
  return nonceManager.refresh();
}

/**
 * REST call against the plugin namespace. A `401/403` nonce failure
 * refreshes the nonce and retries the request once.
 */
export async function apiCall<T = unknown>(
  path: string,
  options: ApiCallOptions = {},
): Promise<T> {
  return (await apiCallWithHeaders<T>(path, options)).data;
}

/**
 * {@link apiCall} that also returns the response headers (pagination:
 * `X-WP-Total`, `X-WP-TotalPages`).
 */
export async function apiCallWithHeaders<T = unknown>(
  path: string,
  options: ApiCallOptions = {},
): Promise<{ data: T; headers: Headers }> {
  const config = getConfig();
  const url = `${config.apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  const { body, headers, ...rest } = options;

  const buildInit = (nonce: string): RequestInit => {
    const init: RequestInit = {
      ...rest,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': nonce,
        Accept: 'application/json',
        ...(headers ?? {}),
      },
    };
    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
    }
    return init;
  };

  const response = await nonceManager.fetchWithNonce(url, buildInit);

  if (!response.ok) {
    let payload: { code?: string; message?: string; data?: unknown } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // not JSON
    }
    throw new ApiError(
      payload.code ?? 'unknown',
      payload.message ?? __('Request failed (%s)', response.status),
      response.status,
      payload.data,
    );
  }

  if (response.status === 204) {
    return { data: undefined as T, headers: response.headers };
  }

  return { data: (await response.json()) as T, headers: response.headers };
}
