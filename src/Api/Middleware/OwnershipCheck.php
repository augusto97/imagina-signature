<?php
/**
 * Permission-callback factory for ownership gating.
 *
 * @package ImaginaSignatures\Api\Middleware
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Middleware;

defined( 'ABSPATH' ) || exit;

/**
 * Builds `permission_callback` closures that verify the current user
 * owns the row identified by a request parameter.
 *
 * Composes a capability check first (reuses the contract from
 * {@see CapabilityCheck}), then runs an injected resolver that
 * answers `is(int $resource_id, int $user_id)`. The resolver is
 * normally `SignatureRepository::find_owned_by` or
 * `AssetRepository::find_owned_by` wrapped in a closure that returns
 * a boolean — passing the repository's bound method directly would
 * leak the model object back through the permission callback, which
 * isn't what `register_rest_route()` expects.
 *
 * @since 1.0.0
 */
final class OwnershipCheck {

	/**
	 * Capability the caller must hold before ownership is even checked.
	 *
	 * @var string
	 */
	private string $capability;

	/**
	 * `function (int $resource_id, int $user_id): bool` ownership probe.
	 *
	 * @var callable
	 */
	private $owner_resolver;

	/**
	 * Request parameter name carrying the resource ID.
	 *
	 * @var string
	 */
	private string $param;

	/**
	 * Optional `function (int $resource_id, int $user_id): bool` asked
	 * when the caller does NOT own the resource — e.g. a team manager
	 * editing someone's signature on their behalf (1.3.0). Null = owners
	 * only.
	 *
	 * @var callable|null
	 */
	private $non_owner_resolver;

	/**
	 * @param string        $capability         Required capability (e.g. `imgsig_use_signatures`).
	 * @param callable      $owner_resolver     `function (int $resource_id, int $user_id): bool`.
	 * @param string        $param              Request parameter holding the resource ID.
	 * @param callable|null $non_owner_resolver `function (int $resource_id, int $user_id): bool` for non-owners (1.3.0).
	 */
	public function __construct( string $capability, callable $owner_resolver, string $param = 'id', ?callable $non_owner_resolver = null ) {
		$this->capability         = $capability;
		$this->owner_resolver     = $owner_resolver;
		$this->param              = $param;
		$this->non_owner_resolver = $non_owner_resolver;
	}

	/**
	 * Returns the `permission_callback` closure.
	 *
	 * Order:
	 *  1. Logged-in?           — 401 if not.
	 *  2. Has capability?      — 403 if not.
	 *  3. Owns the resource?   — else the non-owner resolver, when one
	 *     was given, may still allow it — 403 if neither does.
	 *
	 * @since 1.0.0
	 *
	 * @return callable
	 */
	public function callback(): callable {
		$capability         = $this->capability;
		$owner_resolver     = $this->owner_resolver;
		$param              = $this->param;
		$non_owner_resolver = $this->non_owner_resolver;

		return static function ( \WP_REST_Request $request ) use ( $capability, $owner_resolver, $param, $non_owner_resolver ) {
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

			$resource_id = (int) $request->get_param( $param );
			$user_id     = get_current_user_id();

			$allowed = $resource_id > 0 && (
				$owner_resolver( $resource_id, $user_id )
				|| ( null !== $non_owner_resolver && $non_owner_resolver( $resource_id, $user_id ) )
			);

			if ( ! $allowed ) {
				return new \WP_Error(
					'imgsig_forbidden',
					__( 'The requested resource was not found or does not belong to you.', 'imagina-signatures' ),
					[ 'status' => 403 ]
				);
			}

			return true;
		};
	}
}
