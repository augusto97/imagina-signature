import type { AppConfig } from './types';

/**
 * Returns the bootstrap config the host injected as
 * `window.IMGSIG_EDITOR_CONFIG`.
 *
 * Throws synchronously if the config is missing — that means the
 * iframe was loaded outside the controlled host (e.g. someone hit
 * the URL directly without a token), and bailing here surfaces the
 * problem before any other code runs.
 */
export function getConfig(): AppConfig {
  const config = (window as unknown as { IMGSIG_EDITOR_CONFIG?: AppConfig })
    .IMGSIG_EDITOR_CONFIG;

  if (!config) {
    throw new Error('IMGSIG_EDITOR_CONFIG is missing — editor was loaded outside its host.');
  }
  return config;
}

/**
 * Returns true when the active storage backend allows uploads. False
 * only in URL-only mode (1.0.29). Default true for back-compat with
 * bootstrap configs that pre-date the flag.
 */
export function isUploadEnabled(): boolean {
  try {
    const cfg = getConfig();
    return cfg.uploadEnabled !== false;
  } catch {
    return true;
  }
}

/**
 * Typed REST error. Mirrors the WP_Error JSON shape that
 * BaseController::exception_to_wp_error() emits.
 */
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

interface ApiCallOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * Performs a REST call against the plugin's namespace.
 *
 * - Authentication: WP cookie + `X-WP-Nonce` header (CLAUDE.md §14.4 / §16.1).
 * - Request body is JSON-encoded automatically when present.
 * - Error envelope is unwrapped into a typed {@link ApiError}.
 */
export async function apiCall<T = unknown>(path: string, options: ApiCallOptions = {}): Promise<T> {
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
    init.body = body instanceof FormData ? body : JSON.stringify(body);
    if (body instanceof FormData) {
      // Browsers must set the multipart boundary themselves — the
      // 'Content-Type' header above gets in the way.
      const next = { ...(init.headers as Record<string, string>) };
      delete next['Content-Type'];
      init.headers = next;
    }
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    let payload: { code?: string; message?: string; data?: unknown } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Server didn't return JSON — fall through with defaults.
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
