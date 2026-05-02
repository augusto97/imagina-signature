<?php
/**
 * Plugin uninstall entry point.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Hooks\Actions;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Runs when the plugin is deleted from the WP admin.
 *
 * Triggered from `uninstall.php` (the WordPress-recognised entry point for
 * uninstall logic). This class is the actual implementation; `uninstall.php`
 * is a thin shim that loads the autoloader and calls
 * {@see Uninstaller::uninstall()}.
 *
 * Destructive: drops all `imgsig_*` tables, removes options, removes
 * capabilities from roles, and clears all `imgsig_*` transients
 * (CLAUDE.md §19.7 / §29 SIEMPRE).
 *
 * Files uploaded via the Media Library driver are left in place — the WP
 * Media Library owns those records. Files in S3-compatible storage are
 * also untouched: we don't have credentials at uninstall time, and the
 * user may still need them.
 *
 * @since 1.0.0
 */
final class Uninstaller {

	/**
	 * Tables created by the plugin (without the WP table prefix).
	 *
	 * Keep in sync with `src/Setup/Migrations/`.
	 */
	private const TABLES = [
		'imgsig_signatures',
		'imgsig_templates',
		'imgsig_assets',
	];

	/**
	 * Options written by the plugin.
	 *
	 * Keep in sync with CLAUDE.md §7.3 + every `OPT_*` constant added
	 * by `SiteSettingsController` and friends. The catch-all sweep in
	 * `delete_options()` (DELETE … LIKE 'imgsig\_%') is the safety net
	 * for any new option a future patch forgets to add to this list,
	 * but the explicit list still matters: it documents intent and
	 * routes through `delete_option()` so Multisite + filters fire
	 * properly per-key.
	 */
	private const OPTIONS = [
		'imgsig_version',
		'imgsig_schema_version',
		'imgsig_storage_driver',
		'imgsig_storage_config',
		'imgsig_settings',
		// Site-settings options added in 1.0.13 / 1.0.15 — these were
		// silently leaking on uninstall until 1.0.25 because they
		// weren't on this list (the audit caught the leak).
		'imgsig_brand_palette',
		'imgsig_compliance_footer',
		'imgsig_banner_campaigns',
	];

	/**
	 * Uninstall handler.
	 *
	 * Idempotent: safe to call more than once.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public static function uninstall(): void {
		global $wpdb;

		self::drop_tables( $wpdb );
		self::delete_options();
		self::remove_capabilities();
		self::delete_transients( $wpdb );

		/**
		 * Fires at the end of plugin uninstall, after all data has been removed.
		 *
		 * Note: this fires from `uninstall.php`, so listeners must be in
		 * code that's already loaded by WordPress core (e.g. mu-plugins).
		 * Plugins listening for this from their own files won't be loaded
		 * during uninstall.
		 *
		 * @since 1.0.0
		 */
		do_action( Actions::PLUGIN_UNINSTALLED );
	}

	/**
	 * Drops all plugin-owned tables.
	 *
	 * @since 1.0.0
	 *
	 * @param \wpdb $wpdb WordPress database abstraction.
	 *
	 * @return void
	 */
	private static function drop_tables( \wpdb $wpdb ): void {
		foreach ( self::TABLES as $table ) {
			$full_name = $wpdb->prefix . $table;
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$wpdb->query( "DROP TABLE IF EXISTS `{$full_name}`" );
		}
	}

	/**
	 * Deletes all plugin-owned options.
	 *
	 * Two passes:
	 *  1. Explicit allow-list above so `delete_option()` filters fire
	 *     correctly per known key, and the site-option variant is
	 *     called in case the plugin was active under multisite.
	 *  2. A safety-net SQL sweep that removes any remaining
	 *     `imgsig_*` row from `wp_options` — covers any option a
	 *     future patch writes without adding to {@see OPTIONS}.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private static function delete_options(): void {
		global $wpdb;

		foreach ( self::OPTIONS as $option ) {
			delete_option( $option );
			delete_site_option( $option );
		}

		// Safety net: scrub any straggler `imgsig_*` option that didn't
		// make it into the allow-list. Covers options that future
		// patches add without remembering to update this constant.
		$like = $wpdb->esc_like( 'imgsig_' ) . '%';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
				$like
			)
		);
	}

	/**
	 * Removes plugin capabilities from every role.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private static function remove_capabilities(): void {
		( new CapabilitiesInstaller() )->uninstall();
	}

	/**
	 * Deletes every transient whose key starts with `imgsig_`.
	 *
	 * Covers rate-limit counters and any caching the plugin might write.
	 *
	 * @since 1.0.0
	 *
	 * @param \wpdb $wpdb WordPress database abstraction.
	 *
	 * @return void
	 */
	private static function delete_transients( \wpdb $wpdb ): void {
		$like         = $wpdb->esc_like( '_transient_imgsig_' ) . '%';
		$timeout_like = $wpdb->esc_like( '_transient_timeout_imgsig_' ) . '%';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
				$like,
				$timeout_like
			)
		);
	}
}
