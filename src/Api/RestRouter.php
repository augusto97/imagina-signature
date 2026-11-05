<?php
/**
 * REST router — registers every controller's routes.
 *
 * @package ImaginaSignatures\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api;

defined( 'ABSPATH' ) || exit;

/**
 * Aggregates the plugin's REST controllers and hooks them into
 * `rest_api_init`.
 *
 * Each controller is responsible for declaring its own routes
 * ({@see BaseController::register_routes()}); the router only handles
 * the lifecycle: collect the controllers, register on the right
 * action, and stay out of the controller's way.
 *
 * @since 1.0.0
 */
final class RestRouter {

	/**
	 * Registered controllers.
	 *
	 * @var BaseController[]
	 */
	private array $controllers;

	/**
	 * @param BaseController[] $controllers Controllers to register.
	 */
	public function __construct( array $controllers ) {
		$this->controllers = $controllers;
	}

	/**
	 * Hooks each controller's `register_routes()` into `rest_api_init`.
	 *
	 * Idempotent: calling more than once would double-register, so
	 * {@see Plugin::boot()} calls this exactly once.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function register(): void {
		add_action(
			'rest_api_init',
			function (): void {
				foreach ( $this->controllers as $controller ) {
					$controller->register_routes();
				}
			}
		);

		add_filter( 'rest_post_dispatch', [ self::class, 'add_retry_after_header' ], 10, 3 );
	}

	/**
	 * Adds a `Retry-After` header to our 429 responses.
	 *
	 * Controllers return `WP_Error( 'imgsig_rate_limited', …, [ 'status' =>
	 * 429, 'retry_after' => N ] )`; WordPress converts that into a
	 * response body but has no notion of headers on errors, so the
	 * header is stamped here, after dispatch.
	 *
	 * @since 1.0.40
	 *
	 * @param mixed            $result  Dispatch result (normally a WP_REST_Response).
	 * @param mixed            $server  REST server (unused).
	 * @param \WP_REST_Request $request Request (unused).
	 *
	 * @return mixed
	 */
	public static function add_retry_after_header( $result, $server = null, $request = null ) {
		unset( $server, $request );

		if ( ! $result instanceof \WP_REST_Response || 429 !== $result->get_status() ) {
			return $result;
		}

		$data = $result->get_data();
		if ( ! is_array( $data ) || 'imgsig_rate_limited' !== ( $data['code'] ?? '' ) ) {
			return $result;
		}

		$retry_after = isset( $data['data']['retry_after'] ) ? (int) $data['data']['retry_after'] : 0;
		if ( $retry_after > 0 ) {
			$result->header( 'Retry-After', (string) $retry_after );
		}

		return $result;
	}
}
