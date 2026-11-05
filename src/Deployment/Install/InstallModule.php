<?php
/**
 * Hook wiring of the install-link feature.
 *
 * @package ImaginaSignatures\Deployment\Install
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Install;

use ImaginaSignatures\Core\Container;
use ImaginaSignatures\Core\Cron;
use ImaginaSignatures\Hooks\Actions;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the WordPress hooks of the install link, invitations and
 * reminders. Every callback resolves its service from the container
 * when it fires, so booting costs a few `add_action()` calls.
 *
 *  - `imgsig_install_invitations_batch` (single events) → {@see InvitationQueue::run_batch()};
 *  - `imgsig_daily_cleanup` (the plugin's daily event) → {@see InstallReminders::run()};
 *  - `imgsig/deploy/primary_html_changed` → {@see InstallService::on_primary_html_changed()};
 *  - `imgsig/plugin/deactivated` → drops pending batch events.
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
			InvitationQueue::BATCH_HOOK,
			static function ( $job_id = '' ) use ( $container ): void {
				$container->make( InvitationQueue::class )->run_batch( $job_id );
			}
		);

		add_action(
			Cron::DAILY_HOOK,
			static function () use ( $container ): void {
				$container->make( InstallReminders::class )->run();
			},
			20
		);

		add_action(
			'imgsig/deploy/primary_html_changed',
			static function ( $user_id, $signature = null ) use ( $container ): void {
				$container->make( InstallService::class )->on_primary_html_changed( $user_id, $signature );
			},
			10,
			2
		);

		add_action( Actions::PLUGIN_DEACTIVATED, [ InvitationQueue::class, 'unschedule' ] );
	}
}
