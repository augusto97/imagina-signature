<?php
/**
 * Permission-callback factory for capability gating.
 *
 * @package ImaginaSignatures\Api\Middleware
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Middleware;

defined( 'ABSPATH' ) || exit;

/**
 * Builds reusable `permission_callback` closures for `register_rest_route()`.
 *
 * Every plugin endpoint goes through one of two gates: a capability
 * check (this class) or an ownership check
 * ({@see OwnershipCheck}, which composes a capability check before the
 * row-level test). Centralising the callback shape here keeps the wire
 * contract for 401 / 403 responses identical across endpoints.
 *
 * @since 1.0.0
 */
final class CapabilityCheck {

	/**
	 * Returns a `permission_callback` that requires `$capability`.
	 *
	 * Returns a `WP_Error` (not `false`) so REST renders 401 / 403 with
	 * the documented `imgsig_*` error code instead of WP's default
	 * `rest_forbidden` shape.
	 *
	 * @since 1.0.0
	 *
	 * @param string $capability Capability the caller must have.
	 *
	 * @return callable
	 */
	public static function require_capability( string $capability ): callable {
		return static function () use ( $capability ) {
			if ( ! is_user_logged_in() ) {
				return new \WP_Error(
					'imgsig_unauthenticated',
					__( 'You must be signed in to perform this request.', 'imagina-signatures' ),
					[ 'status' => 401 ]
				);
			}

			if ( ! current_user_can( $capability ) ) {
				return new \WP_Error(
					'imgsig_forbidden',
					__( 'You do not have permission to perform this request.', 'imagina-signatures' ),
					[ 'status' => 403 ]
				);
			}

			return true;
		};
	}
}
