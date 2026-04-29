<?php
/**
 * REST API router.
 *
 * @package ImaginaSignatures\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api;

use ImaginaSignatures\Api\Controllers\AssetsController;
use ImaginaSignatures\Api\Controllers\MeController;
use ImaginaSignatures\Api\Controllers\PlansController;
use ImaginaSignatures\Api\Controllers\SetupController;
use ImaginaSignatures\Api\Controllers\SignaturesController;
use ImaginaSignatures\Api\Controllers\StorageController;
use ImaginaSignatures\Api\Controllers\TemplatesController;
use ImaginaSignatures\Api\Controllers\UploadController;
use ImaginaSignatures\Api\Controllers\UsersController;
use ImaginaSignatures\Core\Container;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Repositories\PlanRepository;
use ImaginaSignatures\Repositories\UsageRepository;
use ImaginaSignatures\Repositories\UserPlanRepository;
use ImaginaSignatures\Security\RateLimiter;
use ImaginaSignatures\Services\PlanService;
use ImaginaSignatures\Services\QuotaEnforcer;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Services\TemplateService;
use ImaginaSignatures\Storage\StorageManager;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Resolves controllers from the container and registers their routes.
 *
 * Each controller is constructed inside its own try/catch so a single
 * failure (e.g. a missing file after a partial update, an option that
 * can't be decrypted, a rogue do_action handler) doesn't bring down the
 * entire REST surface. The setup wizard endpoint is always registered
 * first and has zero dependencies — it survives anything.
 *
 * @since 1.0.0
 */
final class RestRouter {

	private Container $container;

	public function __construct( Container $container ) {
		$this->container = $container;
	}

	/**
	 * Hooks into `rest_api_init`.
	 *
	 * @return void
	 */
	public function register_routes(): void {
		// SetupController has no dependencies — register it first so the
		// user can always finish setup even if something else is broken.
		$this->safe_register( static fn() => new SetupController() );

		$this->safe_register( fn() => new SignaturesController( $this->container->make( SignatureService::class ) ) );
		$this->safe_register( fn() => new TemplatesController(
			$this->container->make( TemplateService::class ),
			$this->container->make( QuotaEnforcer::class )
		) );
		$this->safe_register( fn() => new MeController(
			$this->container->make( QuotaEnforcer::class ),
			$this->container->make( UsageRepository::class )
		) );
		$this->safe_register( fn() => new AssetsController(
			$this->container->make( AssetRepository::class ),
			$this->container->make( UsageRepository::class ),
			$this->container->make( StorageManager::class )
		) );
		$this->safe_register( fn() => new UploadController(
			$this->container->make( StorageManager::class ),
			$this->container->make( AssetRepository::class ),
			$this->container->make( UsageRepository::class ),
			$this->container->make( QuotaEnforcer::class ),
			$this->container->make( RateLimiter::class )
		) );
		$this->safe_register( fn() => new PlansController(
			$this->container->make( PlanService::class ),
			$this->container->make( PlanRepository::class )
		) );
		$this->safe_register( fn() => new UsersController(
			$this->container->make( PlanService::class ),
			$this->container->make( PlanRepository::class ),
			$this->container->make( UserPlanRepository::class ),
			$this->container->make( UsageRepository::class )
		) );
		$this->safe_register( fn() => new StorageController(
			$this->container->make( StorageManager::class )
		) );

		// Health-check endpoint — no dependencies, useful for diagnostics.
		\register_rest_route(
			BaseController::NAMESPACE,
			'/health',
			[
				'methods'             => 'GET',
				'callback'            => static function () {
					return [
						'ok'             => true,
						'version'        => defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : 'unknown',
						'schema_version' => (string) get_option( 'imgsig_schema_version', '0.0.0' ),
						'php'            => PHP_VERSION,
						'time'           => gmdate( 'c' ),
					];
				},
				'permission_callback' => '__return_true',
			]
		);

		do_action( 'imgsig/api/routes_registered', $this );
	}

	/**
	 * Constructs a controller and registers its routes inside a try/catch.
	 *
	 * Failures are logged via `error_log` (always, regardless of the
	 * `enable_logs` setting) so a partially-broken installation can still
	 * be diagnosed from the host's PHP error log.
	 *
	 * @param callable $factory Returns a controller instance.
	 *
	 * @return void
	 */
	private function safe_register( callable $factory ): void {
		try {
			/** @var BaseController $controller */
			$controller = $factory();
			$controller->register_routes();
		} catch ( \Throwable $e ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log(
				'[imagina-signatures] failed to register controller: '
				. get_class( $e ) . ': ' . $e->getMessage()
				. ' at ' . $e->getFile() . ':' . $e->getLine()
			);
		}
	}
}
