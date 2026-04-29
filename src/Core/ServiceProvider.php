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
use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Security\HtmlSanitizer;
use ImaginaSignatures\Security\RateLimiter;
use ImaginaSignatures\Storage\StorageManager;
use ImaginaSignatures\Utils\Logger;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Wires every singleton into the DI container.
 *
 * Bindings are added incrementally as their owning sprint lands. Sprint 2
 * registers the security/storage/admin building blocks; later sprints append
 * repositories, services, and the REST router.
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
		$c->singleton( Logger::class, static fn() => new Logger() );
		$c->singleton( Encryption::class, static fn() => new Encryption() );
		$c->singleton( HtmlSanitizer::class, static fn() => new HtmlSanitizer() );
		$c->singleton( RateLimiter::class, static fn() => new RateLimiter() );

		$c->singleton(
			StorageManager::class,
			static fn( Container $c ) => new StorageManager( $c->make( Encryption::class ) )
		);

		$c->singleton( AdminMenu::class, static fn() => new AdminMenu() );
		$c->singleton( AssetEnqueuer::class, static fn() => new AssetEnqueuer() );
		$c->singleton( Notices::class, static fn() => new Notices() );

		$this->register_sprint_3( $c );
		$this->register_sprint_4( $c );

		/**
		 * Fires after the default services have been registered, so plugins
		 * and integrations can register their own bindings.
		 *
		 * @since 1.0.0
		 *
		 * @param Container $container DI container.
		 */
		do_action( 'imgsig/services/registered', $c );
	}

	/**
	 * Sprint 3 bindings (plans, users, quota). Hooked here to keep `boot()` clean.
	 *
	 * @param Container $c Container.
	 *
	 * @return void
	 */
	private function register_sprint_3( Container $c ): void {
		if ( class_exists( '\\ImaginaSignatures\\Admin\\UserHardening' ) ) {
			$c->singleton( '\\ImaginaSignatures\\Admin\\UserHardening', static fn() => new \ImaginaSignatures\Admin\UserHardening() );
		}
		if ( class_exists( '\\ImaginaSignatures\\Repositories\\PlanRepository' ) ) {
			$c->singleton( '\\ImaginaSignatures\\Repositories\\PlanRepository', static fn() => new \ImaginaSignatures\Repositories\PlanRepository() );
			$c->singleton( '\\ImaginaSignatures\\Repositories\\UserPlanRepository', static fn() => new \ImaginaSignatures\Repositories\UserPlanRepository() );
			$c->singleton( '\\ImaginaSignatures\\Repositories\\UsageRepository', static fn() => new \ImaginaSignatures\Repositories\UsageRepository() );
			$c->singleton(
				'\\ImaginaSignatures\\Services\\QuotaEnforcer',
				static fn( Container $c ) => new \ImaginaSignatures\Services\QuotaEnforcer(
					$c->make( '\\ImaginaSignatures\\Repositories\\PlanRepository' ),
					$c->make( '\\ImaginaSignatures\\Repositories\\UserPlanRepository' ),
					$c->make( '\\ImaginaSignatures\\Repositories\\UsageRepository' )
				)
			);
			$c->singleton(
				'\\ImaginaSignatures\\Services\\PlanService',
				static fn( Container $c ) => new \ImaginaSignatures\Services\PlanService(
					$c->make( '\\ImaginaSignatures\\Repositories\\PlanRepository' ),
					$c->make( '\\ImaginaSignatures\\Repositories\\UserPlanRepository' )
				)
			);
		}
	}

	/**
	 * Sprint 4 bindings (signatures, templates, REST).
	 *
	 * @param Container $c Container.
	 *
	 * @return void
	 */
	private function register_sprint_4( Container $c ): void {
		if ( class_exists( '\\ImaginaSignatures\\Services\\JsonSchemaValidator' ) ) {
			$c->singleton( '\\ImaginaSignatures\\Services\\JsonSchemaValidator', static fn() => new \ImaginaSignatures\Services\JsonSchemaValidator() );
		}
		if ( class_exists( '\\ImaginaSignatures\\Repositories\\SignatureRepository' ) ) {
			$c->singleton( '\\ImaginaSignatures\\Repositories\\SignatureRepository', static fn() => new \ImaginaSignatures\Repositories\SignatureRepository() );
			$c->singleton( '\\ImaginaSignatures\\Repositories\\TemplateRepository', static fn() => new \ImaginaSignatures\Repositories\TemplateRepository() );
			$c->singleton(
				'\\ImaginaSignatures\\Services\\SignatureService',
				static fn( Container $c ) => new \ImaginaSignatures\Services\SignatureService(
					$c->make( '\\ImaginaSignatures\\Repositories\\SignatureRepository' ),
					$c->make( '\\ImaginaSignatures\\Repositories\\UsageRepository' ),
					$c->make( '\\ImaginaSignatures\\Services\\QuotaEnforcer' ),
					$c->make( '\\ImaginaSignatures\\Services\\JsonSchemaValidator' ),
					$c->make( Logger::class )
				)
			);
			$c->singleton(
				'\\ImaginaSignatures\\Services\\TemplateService',
				static fn( Container $c ) => new \ImaginaSignatures\Services\TemplateService(
					$c->make( '\\ImaginaSignatures\\Repositories\\TemplateRepository' ),
					$c->make( '\\ImaginaSignatures\\Services\\JsonSchemaValidator' )
				)
			);
		}
		if ( class_exists( '\\ImaginaSignatures\\Repositories\\AssetRepository' ) ) {
			$c->singleton( '\\ImaginaSignatures\\Repositories\\AssetRepository', static fn() => new \ImaginaSignatures\Repositories\AssetRepository() );
		}
		if ( class_exists( '\\ImaginaSignatures\\Api\\RestRouter' ) ) {
			$c->singleton(
				'\\ImaginaSignatures\\Api\\RestRouter',
				static fn( Container $c ) => new \ImaginaSignatures\Api\RestRouter( $c )
			);
		}
	}
}
