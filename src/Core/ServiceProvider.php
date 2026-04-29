<?php
/**
 * Core service provider — wires plugin services into the DI container.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Storage\StorageManager;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the long-lived plugin services into the container.
 *
 * Called once from {@see Plugin::boot()} before any module-specific
 * registration runs. Sub-systems that need their own bindings (REST
 * controllers, admin pages, etc.) hook into {@see Actions::PLUGIN_BOOTED}
 * with a higher priority so they can resolve from this base set.
 *
 * @since 1.0.0
 */
final class ServiceProvider {

	/**
	 * Registers core bindings.
	 *
	 * Bindings are registered as singletons because the services are
	 * stateless from the consumer's perspective (or, in the case of
	 * StorageManager, intentionally cache state per request).
	 *
	 * @since 1.0.0
	 *
	 * @param Container $container The plugin's DI container.
	 *
	 * @return void
	 */
	public static function register( Container $container ): void {
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
	}
}
