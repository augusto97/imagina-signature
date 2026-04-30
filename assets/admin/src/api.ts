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

export async function apiCall<T = unknown>(
  path: string,
  options: ApiCallOptions = {},
): Promise<T> {
  const config = getConfig();
  const url = `${config.apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  const { body, headers, ...rest } = options;

  const init: RequestInit = {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-WP-Nonce': config.restNonce,
      Accept: 'application/json',
      ...(headers ?? {}),
    },
  };

  if (body !== undefined && body !== null) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    let payload: { code?: string; message?: string; data?: unknown } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // not JSON
    }
    throw new ApiError(
      payload.code ?? 'unknown',
      payload.message ?? `Request failed (${response.status})`,
      response.status,
      payload.data,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
