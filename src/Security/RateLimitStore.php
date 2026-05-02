<?php
/**
 * Transient-backed rate-limit counter store.
 *
 * @package ImaginaSignatures\Security
 */

declare(strict_types=1);

namespace ImaginaSignatures\Security;

defined( 'ABSPATH' ) || exit;

/**
 * Read / write hooks for per-user, per-action rate-limit counters.
 *
 * Uses WordPress transients so the counters survive across requests and
 * are scoped to the site (not the PHP process). Keys are built from
 * `(action, user_id)` so two callers can't step on each other.
 *
 * Pure storage — the policy (how many, how often) lives in
 * {@see \ImaginaSignatures\Api\Middleware\RateLimiter}.
 *
 * @since 1.0.0
 */
final class RateLimitStore {

	/**
	 * Key prefix for every rate-limit transient.
	 *
	 * Matches the prefix removed by the uninstaller's transient sweep
	 * (CLAUDE.md §19.7).
	 */
	private const KEY_PREFIX = 'imgsig_rl_';

	/**
	 * Builds the canonical transient key for an action / user pair.
	 *
	 * @since 1.0.0
	 *
	 * @param string $action  Logical action name (`upload`, `signatures_create`, ...).
	 * @param int    $user_id Owner of the rate window.
	 *
	 * @return string
	 */
	public function key( string $action, int $user_id ): string {
		// Action names go through sanitize_key so caller mistakes can't
		// poison the option_name column with arbitrary characters.
		return self::KEY_PREFIX . sanitize_key( $action ) . '_' . $user_id;
	}

	/**
	 * Returns the current count for a key (0 when the transient doesn't exist).
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Full transient key (use {@see key()} to build it).
	 *
	 * @return int
	 */
	public function get( string $key ): int {
		$value = get_transient( $key );
		return false === $value ? 0 : (int) $value;
	}

	/**
	 * Increments the counter for a key and refreshes the TTL.
	 *
	 * Returns the new count. The TTL is rewritten every call so the
	 * window slides — i.e. the counter only resets after
	 * `$window_seconds` have passed since the last call.
	 *
	 * Atomicity: when the host runs a persistent object cache (Redis,
	 * Memcached, APCu) `wp_cache_incr` is atomic at the cache layer,
	 * so two concurrent increments cannot both observe the same
	 * pre-increment value. Without an external object cache WP
	 * transients land in `wp_options` and the read-modify-write is
	 * non-atomic — we still write a transient there as a TTL anchor,
	 * but on hosts with no persistent cache the rate limit can be
	 * defeated under high concurrency. That's a separate hardening
	 * exercise (DB row lock or `INSERT … ON DUPLICATE KEY`).
	 *
	 * @since 1.0.0
	 *
	 * @param string $key            Transient key.
	 * @param int    $window_seconds Time to live in seconds.
	 *
	 * @return int New counter value.
	 */
	public function increment( string $key, int $window_seconds ): int {
		// Persistent-cache fast path. `wp_using_ext_object_cache()`
		// returns true when a drop-in is wired (Redis Object Cache,
		// W3 Total Cache memcached, etc.). `wp_cache_incr` is atomic
		// in those backends — concurrent calls return correctly
		// sequential values rather than re-reading the pre-increment
		// state.
		if ( function_exists( 'wp_using_ext_object_cache' ) && wp_using_ext_object_cache() ) {
			$cache_group = 'imgsig_rl';
			$next        = wp_cache_incr( $key, 1, $cache_group );
			if ( false === $next ) {
				// Key didn't exist yet — seed it and refresh the TTL.
				wp_cache_set( $key, 1, $cache_group, $window_seconds );
				$next = 1;
			} else {
				// Refresh the TTL so the window stays sliding.
				wp_cache_set( $key, (int) $next, $cache_group, $window_seconds );
			}
			// Mirror to a transient so other code paths that call
			// `get()` (which still uses `get_transient`) see something
			// consistent. The transient TTL is the same window.
			set_transient( $key, (int) $next, $window_seconds );
			return (int) $next;
		}

		// No external cache available — fall back to the read-modify-
		// write transient path. Best effort; documented limitation.
		$next = $this->get( $key ) + 1;
		set_transient( $key, $next, $window_seconds );
		return $next;
	}

	/**
	 * Removes the counter for a key (e.g. after a successful test).
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Transient key.
	 *
	 * @return void
	 */
	public function reset( string $key ): void {
		delete_transient( $key );
	}
}
