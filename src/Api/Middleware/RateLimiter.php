<?php
/**
 * Fixed-window rate limiter.
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
 * Each {@see check()} records one hit in an atomic fixed-window bucket
 * ({@see RateLimitStore::hit()}) and throws a {@see RateLimitException}
 * once the bucket holds more than `$max` hits. The exception carries
 * the real seconds-until-the-window-resets, which the REST layer turns
 * into a `Retry-After` header.
 *
 * Buckets are per (action, user); {@see check_site()} adds site-wide
 * caps (e.g. total test emails per hour) on top.
 *
 * Every limit is filterable through `imgsig/rate_limit/max`
 * (return 0 to disable a limit).
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
	 * @param RateLimitStore $store Atomic counter store.
	 */
	public function __construct( RateLimitStore $store ) {
		$this->store = $store;
	}

	/**
	 * Records a per-user hit and throws when the limit is exceeded.
	 *
	 * Calls 1..`$max` within a window pass; call `$max + 1` (and every
	 * later call in the same window) throws. The window is fixed, so a
	 * client that keeps retrying is still released when it ends.
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
	 * @throws RateLimitException When the limit is exceeded.
	 */
	public function check( string $action, int $user_id, int $max, int $window_seconds ): void {
		$this->enforce( $this->store->key( $action, $user_id ), $action, $user_id, $max, $window_seconds );
	}

	/**
	 * Records a site-wide hit (shared by every user) and throws when the
	 * limit is exceeded.
	 *
	 * @since 1.0.40
	 *
	 * @param string $action         Logical action name.
	 * @param int    $max            Maximum allowed calls within the window, site-wide.
	 * @param int    $window_seconds Window size in seconds.
	 *
	 * @return void
	 *
	 * @throws RateLimitException When the limit is exceeded.
	 */
	public function check_site( string $action, int $max, int $window_seconds ): void {
		$this->enforce( $this->store->site_key( $action ), $action . '_site', 0, $max, $window_seconds );
	}

	/**
	 * Shared implementation.
	 *
	 * @param string $key            Bucket key.
	 * @param string $action         Action name passed to the filter.
	 * @param int    $user_id        User id passed to the filter (0 = site-wide).
	 * @param int    $max            Default maximum.
	 * @param int    $window_seconds Window size.
	 *
	 * @return void
	 *
	 * @throws RateLimitException When the limit is exceeded.
	 */
	private function enforce( string $key, string $action, int $user_id, int $max, int $window_seconds ): void {
		/**
		 * Filters a rate limit's maximum hits per window.
		 *
		 * @since 1.0.40
		 *
		 * @param int    $max            Default maximum. Return 0 to disable.
		 * @param string $action         Action name (`signatures_create`, `upload`, `signatures_test_send_site`…).
		 * @param int    $user_id        User id, or 0 for site-wide buckets.
		 * @param int    $window_seconds Window length.
		 */
		$max = (int) apply_filters( 'imgsig/rate_limit/max', $max, $action, $user_id, $window_seconds );
		if ( $max <= 0 ) {
			return;
		}

		$state = $this->store->hit( $key, $window_seconds );

		if ( $state['hits'] > $max ) {
			throw new RateLimitException(
				sprintf(
					/* translators: %d: number of seconds to wait before retrying. */
					__( 'Too many requests. Try again in %d seconds.', 'imagina-signatures' ),
					$state['retry_after']
				),
				$state['retry_after']
			);
		}
	}
}
