<?php
/**
 * Transient-backed rate limiter.
 *
 * @package ImaginaSignatures\Security
 */

declare(strict_types=1);

namespace ImaginaSignatures\Security;

use ImaginaSignatures\Exceptions\RateLimitException;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Per-user, per-action rate limiter.
 *
 * Uses transients so persistence and cleanup come for free. The window is
 * sliding from the first hit, not aligned to clock boundaries — adequate
 * for the protective use case (uploads, signature creation).
 *
 * @since 1.0.0
 */
final class RateLimiter {

	/**
	 * Throws if the user has exceeded the budget.
	 *
	 * @param string $action          Logical action name.
	 * @param int    $user_id         User to limit.
	 * @param int    $max             Maximum operations in the window.
	 * @param int    $window_seconds  Sliding window length in seconds.
	 *
	 * @throws RateLimitException When the budget is exhausted.
	 */
	public function check( string $action, int $user_id, int $max, int $window_seconds ): void {
		$key   = $this->key_for( $action, $user_id );
		$count = (int) get_transient( $key );

		if ( $count >= $max ) {
			throw new RateLimitException(
				sprintf(
					/* translators: %d: window length in seconds. */
					__( 'Too many requests. Try again in %d seconds.', 'imagina-signatures' ),
					$window_seconds
				)
			);
		}

		set_transient( $key, $count + 1, $window_seconds );
	}

	/**
	 * Resets the counter for an action.
	 *
	 * @param string $action  Action.
	 * @param int    $user_id User.
	 *
	 * @return void
	 */
	public function reset( string $action, int $user_id ): void {
		delete_transient( $this->key_for( $action, $user_id ) );
	}

	/**
	 * Builds the transient key.
	 *
	 * @param string $action  Action.
	 * @param int    $user_id User.
	 *
	 * @return string
	 */
	private function key_for( string $action, int $user_id ): string {
		return 'imgsig_rl_' . sanitize_key( $action ) . '_' . $user_id;
	}
}
