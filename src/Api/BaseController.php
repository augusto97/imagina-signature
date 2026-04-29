<?php
/**
 * Shared helpers for REST controllers.
 *
 * @package ImaginaSignatures\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api;

use ImaginaSignatures\Exceptions\OwnershipException;
use ImaginaSignatures\Exceptions\QuotaExceededException;
use ImaginaSignatures\Exceptions\RateLimitException;
use ImaginaSignatures\Exceptions\ValidationException;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Base controller with common error handling and helpers.
 *
 * @since 1.0.0
 */
abstract class BaseController {

	public const NAMESPACE = 'imgsig/v1';

	/**
	 * Registers routes for this controller.
	 *
	 * @return void
	 */
	abstract public function register_routes(): void;

	/**
	 * Converts a domain exception into a `WP_Error`.
	 *
	 * @param \Throwable $error Exception.
	 *
	 * @return \WP_Error
	 */
	protected function exception_to_wp_error( \Throwable $error ): \WP_Error {
		if ( $error instanceof QuotaExceededException ) {
			return new \WP_Error( 'imgsig_quota_exceeded', $error->getMessage(), [ 'status' => 403 ] );
		}
		if ( $error instanceof OwnershipException ) {
			return new \WP_Error( 'imgsig_forbidden', $error->getMessage(), [ 'status' => 403 ] );
		}
		if ( $error instanceof ValidationException ) {
			return new \WP_Error(
				'imgsig_validation_failed',
				$error->getMessage(),
				[ 'status' => 400, 'errors' => $error->get_errors() ]
			);
		}
		if ( $error instanceof RateLimitException ) {
			return new \WP_Error( 'imgsig_rate_limited', $error->getMessage(), [ 'status' => 429 ] );
		}
		return new \WP_Error( 'imgsig_server_error', $error->getMessage(), [ 'status' => 500 ] );
	}

	/**
	 * Standard permission callback for own-resource endpoints.
	 *
	 * Site administrators (anyone with `manage_options`) always pass — this
	 * keeps the plugin usable even if activation didn't manage to grant the
	 * `imgsig_*` caps to their role (network super admins, half-completed
	 * activation, etc.). Per-endpoint logic still applies ownership checks.
	 *
	 * @param string $cap Capability.
	 *
	 * @return callable
	 */
	protected function permission_for( string $cap ): callable {
		return static function () use ( $cap ): bool {
			return current_user_can( $cap ) || current_user_can( 'manage_options' );
		};
	}
}
