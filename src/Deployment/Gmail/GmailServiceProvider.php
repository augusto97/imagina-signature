<?php
/**
 * Container bindings for the Gmail integration.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

use ImaginaSignatures\Api\Controllers\GmailDeployController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Core\Container;
use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Services\SignatureService;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the Gmail push services. Called from
 * {@see \ImaginaSignatures\Core\ServiceProvider::register()} after the
 * core bindings it depends on (Encryption, SignatureService, RateLimiter).
 *
 * @since 1.3.0
 */
final class GmailServiceProvider {

	/**
	 * Registers the bindings.
	 *
	 * @since 1.3.0
	 *
	 * @param Container $container DI container.
	 *
	 * @return void
	 */
	public static function register( Container $container ): void {
		$container->singleton(
			GmailSettings::class,
			static function ( Container $c ): GmailSettings {
				return new GmailSettings( $c->make( Encryption::class ) );
			}
		);
		$container->singleton(
			GmailTokenClient::class,
			static function ( Container $c ): GmailTokenClient {
				return new GmailTokenClient( $c->make( GmailSettings::class ), $c->make( Encryption::class ) );
			}
		);
		$container->singleton(
			GmailApi::class,
			static function ( Container $c ): GmailApi {
				return new GmailApi( $c->make( GmailTokenClient::class ), $c->make( GmailSettings::class ) );
			}
		);
		$container->singleton(
			GmailUserDirectory::class,
			static function (): GmailUserDirectory {
				global $wpdb;
				return new GmailUserDirectory( $wpdb );
			}
		);
		$container->singleton(
			GmailPusher::class,
			static function ( Container $c ): GmailPusher {
				return new GmailPusher(
					$c->make( GmailSettings::class ),
					$c->make( GmailApi::class ),
					$c->make( SignatureService::class )
				);
			}
		);
		$container->singleton(
			GmailScheduler::class,
			static function ( Container $c ): GmailScheduler {
				return new GmailScheduler(
					$c->make( GmailSettings::class ),
					$c->make( GmailPusher::class ),
					$c->make( GmailUserDirectory::class )
				);
			}
		);
		$container->singleton(
			GmailDeployController::class,
			static function ( Container $c ): GmailDeployController {
				return new GmailDeployController(
					$c->make( GmailSettings::class ),
					$c->make( GmailApi::class ),
					$c->make( GmailPusher::class ),
					$c->make( GmailScheduler::class ),
					$c->make( GmailUserDirectory::class ),
					$c->make( RateLimiter::class ),
					$c->make( SignatureService::class )
				);
			}
		);
	}
}
