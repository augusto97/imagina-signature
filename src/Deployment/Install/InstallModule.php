<?php
/**
 * Hook wiring of the install-link feature.
 *
 * @package ImaginaSignatures\Deployment\Install
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Install;

use ImaginaSignatures\Core\Container;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the WordPress hooks of the install link. Every callback
 * resolves its service from the container when it fires, so booting
 * costs a few `add_action()` calls.
 *
 *  - `imgsig/deploy/primary_html_changed` → {@see InstallService::on_primary_html_changed()}.
 *
 * The public page itself is dispatched by
 * {@see \ImaginaSignatures\Frontend\FrontendRouter}.
 *
 * @since 1.3.0
 */
final class InstallModule {

	/**
	 * Hooks the callbacks.
	 *
	 * @since 1.3.0
	 *
	 * @param Container $container Plugin container.
	 *
	 * @return void
	 */
	public static function register( Container $container ): void {
		add_action(
			'imgsig/deploy/primary_html_changed',
			static function ( $user_id, $signature = null ) use ( $container ): void {
				$container->make( InstallService::class )->on_primary_html_changed( $user_id, $signature );
			},
			10,
			2
		);
	}
}
