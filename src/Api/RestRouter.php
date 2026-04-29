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
		$controllers = [
			new SignaturesController( $this->container->make( SignatureService::class ) ),
			new TemplatesController(
				$this->container->make( TemplateService::class ),
				$this->container->make( QuotaEnforcer::class )
			),
			new MeController(
				$this->container->make( QuotaEnforcer::class ),
				$this->container->make( UsageRepository::class )
			),
			new AssetsController(
				$this->container->make( AssetRepository::class ),
				$this->container->make( UsageRepository::class ),
				$this->container->make( StorageManager::class )
			),
			new UploadController(
				$this->container->make( StorageManager::class ),
				$this->container->make( AssetRepository::class ),
				$this->container->make( UsageRepository::class ),
				$this->container->make( QuotaEnforcer::class ),
				$this->container->make( RateLimiter::class )
			),
			new PlansController(
				$this->container->make( PlanService::class ),
				$this->container->make( PlanRepository::class )
			),
			new UsersController(
				$this->container->make( PlanService::class ),
				$this->container->make( PlanRepository::class ),
				$this->container->make( UserPlanRepository::class ),
				$this->container->make( UsageRepository::class )
			),
			new StorageController( $this->container->make( StorageManager::class ) ),
			new SetupController(),
		];

		foreach ( $controllers as $controller ) {
			$controller->register_routes();
		}

		do_action( 'imgsig/api/routes_registered', $this );
	}
}
