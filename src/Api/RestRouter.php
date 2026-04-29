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
	}
}
