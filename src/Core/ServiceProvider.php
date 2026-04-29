<?php
/**
 * Registers plugin services in the container.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Admin\AdminMenu;
use ImaginaSignatures\Admin\AssetEnqueuer;
use ImaginaSignatures\Admin\Notices;
use ImaginaSignatures\Admin\SetupFallback;
use ImaginaSignatures\Admin\UserHardening;
use ImaginaSignatures\Api\RestRouter;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Repositories\PlanRepository;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Repositories\UsageRepository;
use ImaginaSignatures\Repositories\UserPlanRepository;
use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Security\HtmlSanitizer;
use ImaginaSignatures\Security\RateLimiter;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\PlanService;
use ImaginaSignatures\Services\QuotaEnforcer;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Services\TemplateService;
use ImaginaSignatures\Storage\StorageManager;
use ImaginaSignatures\Utils\Logger;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Wires every singleton into the DI container.
 *
 * Bindings use `::class` constants (no leading backslash) so consumers can
 * resolve services with the exact same identifier.
 *
 * @since 1.0.0
 */
final class ServiceProvider {

	/**
	 * Registers bindings.
	 *
	 * @param Container $c Container.
	 *
	 * @return void
	 */
	public function register( Container $c ): void {
		// Cross-cutting utilities.
		$c->singleton( Logger::class, static fn() => new Logger() );
		$c->singleton( Encryption::class, static fn() => new Encryption() );
		$c->singleton( HtmlSanitizer::class, static fn() => new HtmlSanitizer() );
		$c->singleton( RateLimiter::class, static fn() => new RateLimiter() );
		$c->singleton( JsonSchemaValidator::class, static fn() => new JsonSchemaValidator() );

		// Storage.
		$c->singleton(
			StorageManager::class,
			static fn( Container $c ) => new StorageManager( $c->make( Encryption::class ) )
		);

		// Repositories.
		$c->singleton( SignatureRepository::class, static fn() => new SignatureRepository() );
		$c->singleton( TemplateRepository::class, static fn() => new TemplateRepository() );
		$c->singleton( AssetRepository::class, static fn() => new AssetRepository() );
		$c->singleton( PlanRepository::class, static fn() => new PlanRepository() );
		$c->singleton( UserPlanRepository::class, static fn() => new UserPlanRepository() );
		$c->singleton( UsageRepository::class, static fn() => new UsageRepository() );

		// Services.
		$c->singleton(
			QuotaEnforcer::class,
			static fn( Container $c ) => new QuotaEnforcer(
				$c->make( PlanRepository::class ),
				$c->make( UserPlanRepository::class ),
				$c->make( UsageRepository::class )
			)
		);
		$c->singleton(
			PlanService::class,
			static fn( Container $c ) => new PlanService(
				$c->make( PlanRepository::class ),
				$c->make( UserPlanRepository::class )
			)
		);
		$c->singleton(
			SignatureService::class,
			static fn( Container $c ) => new SignatureService(
				$c->make( SignatureRepository::class ),
				$c->make( UsageRepository::class ),
				$c->make( QuotaEnforcer::class ),
				$c->make( JsonSchemaValidator::class ),
				$c->make( Logger::class )
			)
		);
		$c->singleton(
			TemplateService::class,
			static fn( Container $c ) => new TemplateService(
				$c->make( TemplateRepository::class ),
				$c->make( JsonSchemaValidator::class )
			)
		);

		// Admin / REST.
		$c->singleton( AdminMenu::class, static fn() => new AdminMenu() );
		$c->singleton( AssetEnqueuer::class, static fn() => new AssetEnqueuer() );
		$c->singleton( Notices::class, static fn() => new Notices() );
		$c->singleton( UserHardening::class, static fn() => new UserHardening() );
		$c->singleton( SetupFallback::class, static fn() => new SetupFallback() );
		$c->singleton(
			RestRouter::class,
			static fn( Container $c ) => new RestRouter( $c )
		);

		/**
		 * Fires after the default services have been registered, so plugins
		 * and integrations can register their own bindings or override ours.
		 *
		 * @since 1.0.0
		 *
		 * @param Container $container DI container.
		 */
		do_action( 'imgsig/services/registered', $c );
	}
}
