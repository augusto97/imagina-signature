<?php
/**
 * Plugin uninstall handler.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Setup\RolesInstaller;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Removes every trace of the plugin from the host site.
 *
 * Called from `uninstall.php`. Deletes custom tables, options, transients, and
 * roles/capabilities. Asset files in `wp-content/uploads/imagina-signatures/`
 * are intentionally preserved — users may still need to retrieve images that
 * were embedded in signatures distributed to their email clients.
 *
 * @since 1.0.0
 */
final class Uninstaller {

	/**
	 * Tables created by the plugin (without the `$wpdb->prefix`).
	 *
	 * @var string[]
	 */
	private const TABLES = [
		'imgsig_signatures',
		'imgsig_templates',
		'imgsig_assets',
		'imgsig_plans',
		'imgsig_user_plans',
		'imgsig_usage',
		'imgsig_logs',
	];

	/**
	 * Options created by the plugin.
	 *
	 * @var string[]
	 */
	private const OPTIONS = [
		'imgsig_version',
		'imgsig_schema_version',
		'imgsig_mode',
		'imgsig_storage_driver',
		'imgsig_storage_config',
		'imgsig_branding',
		'imgsig_default_plan_id',
		'imgsig_setup_completed',
		'imgsig_settings',
		'imgsig_activated_at',
	];

	/**
	 * Uninstall entry point. Called from `uninstall.php`.
	 *
	 * @since 1.0.0
	 */
	public static function uninstall(): void {
		self::drop_tables();
		self::delete_options();
		self::clear_transients();
		( new RolesInstaller() )->uninstall();

		/**
		 * Fires after the plugin has been uninstalled.
		 *
		 * @since 1.0.0
		 */
		do_action( 'imgsig/plugin/uninstalled' );
	}

	/**
	 * Drops every plugin-owned table.
	 *
	 * @since 1.0.0
	 */
	private static function drop_tables(): void {
		global $wpdb;
		foreach ( self::TABLES as $table ) {
			$full = $wpdb->prefix . $table;
			// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$wpdb->query( "DROP TABLE IF EXISTS {$full}" );
			// phpcs:enable
		}
	}

	/**
	 * Deletes plugin options.
	 *
	 * @since 1.0.0
	 */
	private static function delete_options(): void {
		foreach ( self::OPTIONS as $option ) {
			delete_option( $option );
		}
	}

	/**
	 * Removes every plugin transient.
	 *
	 * @since 1.0.0
	 */
	private static function clear_transients(): void {
		global $wpdb;
		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		$wpdb->query(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_imgsig\\_%' ESCAPE '\\\\'
			 OR option_name LIKE '\\_transient\\_timeout\\_imgsig\\_%' ESCAPE '\\\\'"
		);
		// phpcs:enable
	}
}
