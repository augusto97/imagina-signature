<?php
/**
 * Core service provider — wires plugin services into the DI container.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Api\Controllers\AssetsController;
use ImaginaSignatures\Api\Controllers\MeController;
use ImaginaSignatures\Api\Controllers\SignaturesController;
use ImaginaSignatures\Api\Controllers\StorageController;
use ImaginaSignatures\Api\Controllers\TemplatesController;
use ImaginaSignatures\Api\Controllers\UploadController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Security\RateLimitStore;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Services\TemplateService;
use ImaginaSignatures\Storage\StorageManager;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the long-lived plugin services into the container.
 *
 * Called once from {@see Plugin::boot()} before any module-specific
 * registration runs. Sub-systems that need their own bindings hook
 * into {@see \ImaginaSignatures\Hooks\Actions::PLUGIN_BOOTED} so they
 * can resolve from this base set.
 *
 * @since 1.0.0
 */
final class ServiceProvider {

	/**
	 * Registers core bindings.
	 *
	 * @since 1.0.0
	 *
	 * @param Container $container The plugin's DI container.
	 *
	 * @return void
	 */
	public static function register( Container $container ): void {
		// Storage / security primitives.
		$container->singleton(
			Encryption::class,
			static function (): Encryption {
				return new Encryption();
			}
		);
		$container->singleton(
			StorageManager::class,
			static function ( Container $c ): StorageManager {
				return new StorageManager( $c->make( Encryption::class ) );
			}
		);

		// Domain helpers.
		$container->singleton(
			JsonSchemaValidator::class,
			static function (): JsonSchemaValidator {
				return new JsonSchemaValidator();
			}
		);
		$container->singleton(
			HtmlSanitizer::class,
			static function (): HtmlSanitizer {
				return new HtmlSanitizer();
			}
		);

		// Rate-limit primitives.
		$container->singleton(
			RateLimitStore::class,
			static function (): RateLimitStore {
				return new RateLimitStore();
			}
		);
		$container->singleton(
			RateLimiter::class,
			static function ( Container $c ): RateLimiter {
				return new RateLimiter( $c->make( RateLimitStore::class ) );
			}
		);

		// Repositories. Each one needs $wpdb at construction time —
		// resolved lazily so test harnesses can rebind it.
		$container->singleton(
			SignatureRepository::class,
			static function (): SignatureRepository {
				global $wpdb;
				return new SignatureRepository( $wpdb );
			}
		);
		$container->singleton(
			TemplateRepository::class,
			static function (): TemplateRepository {
				global $wpdb;
				return new TemplateRepository( $wpdb );
			}
		);
		$container->singleton(
			AssetRepository::class,
			static function (): AssetRepository {
				global $wpdb;
				return new AssetRepository( $wpdb );
			}
		);

		// Domain services.
		$container->singleton(
			SignatureService::class,
			static function ( Container $c ): SignatureService {
				return new SignatureService(
					$c->make( SignatureRepository::class ),
					$c->make( JsonSchemaValidator::class )
				);
			}
		);
		$container->singleton(
			TemplateService::class,
			static function ( Container $c ): TemplateService {
				return new TemplateService(
					$c->make( TemplateRepository::class ),
					$c->make( JsonSchemaValidator::class )
				);
			}
		);

		// REST controllers.
		$container->singleton(
			MeController::class,
			static function (): MeController {
				return new MeController();
			}
		);
		$container->singleton(
			SignaturesController::class,
			static function ( Container $c ): SignaturesController {
				return new SignaturesController(
					$c->make( SignatureService::class ),
					$c->make( SignatureRepository::class ),
					$c->make( RateLimiter::class )
				);
			}
		);
		$container->singleton(
			TemplatesController::class,
			static function ( Container $c ): TemplatesController {
				return new TemplatesController(
					$c->make( TemplateService::class ),
					$c->make( TemplateRepository::class )
				);
			}
		);
		$container->singleton(
			StorageController::class,
			static function ( Container $c ): StorageController {
				return new StorageController( $c->make( StorageManager::class ) );
			}
		);
		$container->singleton(
			UploadController::class,
			static function ( Container $c ): UploadController {
				return new UploadController(
					$c->make( StorageManager::class ),
					$c->make( AssetRepository::class ),
					$c->make( RateLimiter::class )
				);
			}
		);
		$container->singleton(
			AssetsController::class,
			static function ( Container $c ): AssetsController {
				return new AssetsController(
					$c->make( AssetRepository::class ),
					$c->make( StorageManager::class )
				);
			}
		);
	}
}
