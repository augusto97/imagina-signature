/**
 * WordPress REST nonce lifecycle, shared by the editor and the admin
 * app API clients.
 *
 * Both apps authenticate REST calls with the logged-in cookie plus an
 * `X-WP-Nonce` header whose value was baked into the page at load
 * time. WordPress nonces expire after 12–24 h, so a tab left open
 * overnight starts failing every request with
 * `403 rest_cookie_invalid_nonce` — autosave included, which used to
 * mean silently lost edits.
 *
 * This module:
 *   - fetches a fresh nonce from core's `admin-ajax.php?action=rest-nonce`
 *     handler (`wp_ajax_rest_nonce`, which answers with the bare nonce
 *     as plain text for a logged-in cookie, `0` otherwise);
 *   - writes it back into the in-memory bootstrap config object, so
 *     every later reader of `config.restNonce` sees it;
 *   - retries a request exactly once when it failed with a nonce error;
 *   - refreshes proactively every 10 h while the page is open, and when
 *     a tab becomes visible again after that long (timers don't fire
 *     while a laptop sleeps).
 *
 * Zero external requests: the only endpoint is the site's own
 * admin-ajax.php (CLAUDE.md §1.3).
 */

/** Minimal slice of the bootstrap configs this module reads / writes. */
export interface NonceConfig {
  restNonce: string;
  /** Absolute URL of `wp-admin/admin-ajax.php`. Optional for back-compat. */
  ajaxUrl?: string;
}

/** Proactive refresh period — comfortably inside WP's 12 h nonce tick. */
export const NONCE_REFRESH_INTERVAL_MS = 10 * 60 * 60 * 1000;

export interface RestNonceManager {
  /** Fetch a fresh nonce and store it in the config. Resolves null on failure. Concurrent calls share one request. */
  refresh: () => Promise<string | null>;
  /** Start the 10 h keep-alive (idempotent). */
  startKeepAlive: () => void;
  /**
   * `fetch` wrapper: performs the request with the current nonce and,
   * when the response is a nonce failure, refreshes the nonce and
   * retries once. Returns the final Response either way.
   */
  fetchWithNonce: (url: string, init: (nonce: string) => RequestInit) => Promise<Response>;
}

/**
 * Whether a REST error response is a nonce failure (as opposed to a
 * real permission error, which must not trigger a retry).
 */
export function isNonceError(status: number, code: unknown): boolean {
  if (status !== 401 && status !== 403) return false;
  if (typeof code !== 'string') return false;
  return code === 'rest_cookie_invalid_nonce' || /nonce/i.test(code);
}

/** `ajaxUrl` from the config, or the conventional location as a fallback. */
export function resolveAjaxUrl(config: NonceConfig): string {
  if (config.ajaxUrl) return config.ajaxUrl;
  return `${window.location.origin}/wp-admin/admin-ajax.php`;
}

const NONCE_SHAPE = /^[A-Za-z0-9_-]{4,128}$/;

export function createRestNonceManager(getConfig: () => NonceConfig): RestNonceManager {
  let inFlight: Promise<string | null> | null = null;
  let lastRefreshAt = Date.now();
  let keepAliveStarted = false;

  const refresh = (): Promise<string | null> => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const config = getConfig();
        const base = resolveAjaxUrl(config);
        const url = `${base}${base.includes('?') ? '&' : '?'}action=rest-nonce`;
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'text/plain' },
        });
        if (!response.ok) return null;
        const nonce = (await response.text()).trim();
        // `0` / `-1` mean "not logged in" / "bad request".
        if (!NONCE_SHAPE.test(nonce)) return null;
        config.restNonce = nonce;
        lastRefreshAt = Date.now();
        return nonce;
      } catch {
        return null;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const startKeepAlive = (): void => {
    if (keepAliveStarted || typeof window === 'undefined') return;
    keepAliveStarted = true;
    window.setInterval(() => {
      void refresh();
    }, NONCE_REFRESH_INTERVAL_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (
          document.visibilityState === 'visible' &&
          Date.now() - lastRefreshAt >= NONCE_REFRESH_INTERVAL_MS
        ) {
          void refresh();
        }
      });
    }
  };

  const fetchWithNonce = async (
    url: string,
    init: (nonce: string) => RequestInit,
  ): Promise<Response> => {
    startKeepAlive();
    const sentNonce = getConfig().restNonce;
    const response = await fetch(url, init(sentNonce));
    if (response.status !== 401 && response.status !== 403) return response;

    let code: unknown = null;
    try {
      code = ((await response.clone().json()) as { code?: unknown }).code;
    } catch {
      return response; // not a WP_Error JSON body — not ours to handle
    }
    if (!isNonceError(response.status, code)) return response;

    // Another request may already have refreshed the nonce while this
    // one was in flight — reuse it instead of fetching again.
    const current = getConfig().restNonce;
    const fresh = current !== sentNonce ? current : await refresh();
    if (!fresh) return response;
    return fetch(url, init(fresh));
  };

  return { refresh, startKeepAlive, fetchWithNonce };
}
