<?php
/**
 * Plugin deactivation handler.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Lightweight cleanup when the plugin is deactivated.
 *
 * Deactivation is reversible — we don't drop tables, capabilities, or options
 * here. Destructive cleanup happens only on uninstall.
 *
 * @since 1.0.0
 */
final class Deactivator {

	/**
	 * Deactivation entry point. Called by `register_deactivation_hook`.
	 *
	 * @since 1.0.0
	 */
	public static function deactivate(): void {
		self::clear_transients();

		/**
		 * Fires after the plugin has been deactivated.
		 *
		 * @since 1.0.0
		 */
		do_action( 'imgsig/plugin/deactivated' );

		flush_rewrite_rules( false );
	}

	/**
	 * Removes plugin transients so stale caches don't persist across re-activation.
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
