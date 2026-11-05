<?php
/**
 * Plugin deactivation entry point.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Frontend\FrontendRouter;
use ImaginaSignatures\Hooks\Actions;

defined( 'ABSPATH' ) || exit;

/**
 * Runs once when the plugin is deactivated.
 *
 * Deactivation should NOT delete user data. Tables, options, signatures,
 * and uploaded assets all stay in place so a re-activation picks up
 * exactly where the user left off. Destructive cleanup belongs in
 * {@see Uninstaller} (triggered when the plugin is deleted from
 * `Plugins → Deleted`).
 *
 * Responsibilities:
 *  - Unschedule any cron events the plugin may have registered.
 *  - Flush rewrite rules to drop our REST routes from the cache.
 *
 * @since 1.0.0
 */
final class Deactivator {

	/**
	 * Deactivation handler.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public static function deactivate(): void {
		// Drop every plugin-scheduled event.
		Cron::unschedule();

		// Drop the public `/<slug>/` route from the permalink cache. Our
		// rules were registered on this request's `init`, so remove them
		// from the registry first or the flush would persist them again.
		FrontendRouter::unregister_rewrite_rules();
		flush_rewrite_rules( false );

		/**
		 * Fires after the plugin has finished deactivating.
		 *
		 * @since 1.0.0
		 */
		do_action( Actions::PLUGIN_DEACTIVATED );
	}
}
