<?php
/**
 * Per-user rate limiter.
 *
 * @package ImaginaSignatures\Api\Middleware
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Middleware;

use ImaginaSignatures\Exceptions\RateLimitException;
use ImaginaSignatures\Security\RateLimitStore;

defined( 'ABSPATH' ) || exit;

/**
 * Counter-based rate limiter (CLAUDE.md §19.3).
 *
 * Each call to {@see check()} increments a per-(action, user) counter
 * stored in {@see RateLimitStore}. When the counter reaches the
 * configured maximum, the next call throws a {@see RateLimitException}
 * carrying the seconds-until-reset value so the REST controller can
 * emit a `Retry-After` header.
 *
 * Scope is always per-user: the goal is to slow down a single
 * misbehaving session, not to throttle the site as a whole. For
 * unauthenticated callers (which the plugin shouldn't have, but
 * defensively) the limiter falls back to user_id = 0, giving every
 * such caller a shared bucket — coarse but safe.
 *
 * Not `final` so PHPUnit 9 can produce mock doubles in controller tests.
 *
 * @since 1.0.0
 */
class RateLimiter {

	/**
	 * Storage backend.
	 *
	 * @var RateLimitStore
	 */
	private RateLimitStore $store;

	/**
	 * @param RateLimitStore $store Transient counter store.
	 */
	public function __construct( RateLimitStore $store ) {
		$this->store = $store;
	}

	/**
	 * Records a request and throws when the limit is reached.
	 *
	 * Idempotent semantics:
	 *  - At call N (for N < `$max`) the counter increments and we return.
	 *  - At call `$max` (the (max+1)-th call within the window), this
	 *    throws BEFORE incrementing, so a caller hammering the endpoint
	 *    can't keep extending the window indefinitely.
	 *
	 * @since 1.0.0
	 *
	 * @param string $action         Logical action name.
	 * @param int    $user_id        Owner of the rate window.
	 * @param int    $max            Maximum allowed calls within the window.
	 * @param int    $window_seconds Window size in seconds.
	 *
	 * @return void
	 *
	 * @throws RateLimitException When the limit is reached.
	 */
	public function check( string $action, int $user_id, int $max, int $window_seconds ): void {
		$key   = $this->store->key( $action, $user_id );
		$count = $this->store->get( $key );

		if ( $count >= $max ) {
			throw new RateLimitException(
				sprintf(
					/* translators: %d: number of seconds to wait before retrying. */
					__( 'Too many requests. Try again in %d seconds.', 'imagina-signatures' ),
					$window_seconds
				),
				$window_seconds
			);
		}

		$this->store->increment( $key, $window_seconds );
	}
}
