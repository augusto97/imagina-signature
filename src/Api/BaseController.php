<?php
/**
 * Base REST controller with shared helpers.
 *
 * @package ImaginaSignatures\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api;

use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Exceptions\OwnershipException;
use ImaginaSignatures\Exceptions\RateLimitException;
use ImaginaSignatures\Exceptions\StorageException;
use ImaginaSignatures\Exceptions\ValidationException;

defined( 'ABSPATH' ) || exit;

/**
 * Abstract parent for every REST controller.
 *
 * Provides three pieces controllers reach for repeatedly:
 *
 *  - {@see exception_to_wp_error()} — typed translation of the plugin's
 *    exception hierarchy into the matching `WP_Error` + HTTP status.
 *    Using this helper keeps the wire-level error contract uniform
 *    across every endpoint.
 *  - {@see paginated_response()} — wraps an item list in a
 *    `WP_REST_Response` and stamps the `X-WP-Total` / `X-WP-TotalPages`
 *    headers that the WordPress REST conventions expect.
 *  - {@see check_capability()} — permission_callback helper.
 *
 * Subclasses must implement {@see register_routes()} and call
 * `register_rest_route()` from there. The {@see RestRouter} hooks each
 * controller into `rest_api_init`.
 *
 * @since 1.0.0
 */
abstract class BaseController {

	/**
	 * REST namespace (CLAUDE.md §16.1).
	 */
	public const NAMESPACE = 'imagina-signatures/v1';

	/**
	 * Registers every route this controller owns.
	 *
	 * Called from {@see RestRouter::register()} on `rest_api_init`.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	abstract public function register_routes(): void;

	/**
	 * Translates a plugin exception into a WP_Error with the right status.
	 *
	 * Mapping (CLAUDE.md §5.4):
	 *
	 *  - ValidationException → 400 + `errors` payload
	 *  - OwnershipException  → 403
	 *  - RateLimitException  → 429 + `Retry-After`
	 *  - StorageException    → 500 (`imgsig_storage_error`)
	 *  - ImaginaSignaturesException → 500 (`imgsig_error`)
	 *
	 * @since 1.0.0
	 *
	 * @param ImaginaSignaturesException $exception The exception to translate.
	 *
	 * @return \WP_Error
	 */
	protected function exception_to_wp_error( ImaginaSignaturesException $exception ): \WP_Error {
		if ( $exception instanceof ValidationException ) {
			return new \WP_Error(
				'imgsig_validation_failed',
				$exception->getMessage(),
				[
					'status' => 400,
					'errors' => $exception->get_errors(),
				]
			);
		}

		if ( $exception instanceof OwnershipException ) {
			return new \WP_Error(
				'imgsig_forbidden',
				$exception->getMessage(),
				[ 'status' => 403 ]
			);
		}

		if ( $exception instanceof RateLimitException ) {
			return new \WP_Error(
				'imgsig_rate_limited',
				$exception->getMessage(),
				[
					'status'      => 429,
					'retry_after' => $exception->get_retry_after_seconds(),
				]
			);
		}

		if ( $exception instanceof StorageException ) {
			return new \WP_Error(
				'imgsig_storage_error',
				$exception->getMessage(),
				[ 'status' => 500 ]
			);
		}

		return new \WP_Error(
			'imgsig_error',
			$exception->getMessage(),
			[ 'status' => 500 ]
		);
	}

	/**
	 * Wraps a paginated list in a `WP_REST_Response` and adds the
	 * `X-WP-Total` and `X-WP-TotalPages` response headers per WP REST
	 * conventions.
	 *
	 * @since 1.0.0
	 *
	 * @param array<int, mixed> $items    Page contents (already serialised).
	 * @param int               $total    Total number of items across all pages.
	 * @param int               $per_page Items requested per page.
	 *
	 * @return \WP_REST_Response
	 */
	protected function paginated_response( array $items, int $total, int $per_page ): \WP_REST_Response {
		$response = rest_ensure_response( $items );
		$response->header( 'X-WP-Total', (string) $total );
		$response->header(
			'X-WP-TotalPages',
			(string) ( $per_page > 0 ? (int) ceil( $total / $per_page ) : 0 )
		);
		return $response;
	}

	/**
	 * Permission-callback helper for capability gating.
	 *
	 * @since 1.0.0
	 *
	 * @param string $capability Capability the user must have.
	 *
	 * @return bool|\WP_Error  True when allowed, WP_Error otherwise so REST
	 *                         can render a `401`/`403` response uniformly.
	 */
	protected function check_capability( string $capability ) {
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
	}

	/**
	 * Reads a positive integer query/body argument, falling back to a default.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound request.
	 * @param string           $name    Param name.
	 * @param int              $default Fallback value when missing or invalid.
	 *
	 * @return int
	 */
	protected function read_int( \WP_REST_Request $request, string $name, int $default ): int {
		$value = $request->get_param( $name );
		if ( null === $value || '' === $value ) {
			return $default;
		}
		$int = (int) $value;
		return $int > 0 ? $int : $default;
	}
}
