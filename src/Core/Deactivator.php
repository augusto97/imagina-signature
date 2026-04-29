<?php
/**
 * Plugin deactivation entry point.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

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
		// Drop any plugin-scheduled events. Listed explicitly so we don't
		// have to scan the cron table; future events are added to this list
		// when their schedulers are introduced.
		$scheduled_hooks = [
			// (none yet — placeholder for future cron jobs).
		];

		foreach ( $scheduled_hooks as $hook ) {
			wp_clear_scheduled_hook( $hook );
		}

		// Drop our REST routes from the rewrite cache.
		flush_rewrite_rules();

		/**
		 * Fires after the plugin has finished deactivating.
		 *
		 * @since 1.0.0
		 */
		do_action( Actions::PLUGIN_DEACTIVATED );
	}
}
