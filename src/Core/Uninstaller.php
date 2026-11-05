<?php
/**
 * Plugin uninstall entry point.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Deployment\Install\InstallTokens;
use ImaginaSignatures\Hooks\Actions;
use ImaginaSignatures\Models\Asset;
use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Storage\Drivers\MediaLibraryDriver;
use ImaginaSignatures\Storage\Drivers\S3Driver;
use ImaginaSignatures\Storage\StorageManager;
use ImaginaSignatures\Storage\UploadPolicy;

defined( 'ABSPATH' ) || exit;

/**
 * Runs when the plugin is deleted from the WP admin.
 *
 * Triggered from `uninstall.php` (the WordPress-recognised entry point for
 * uninstall logic). This class is the actual implementation; `uninstall.php`
 * is a thin shim that loads the autoloader and calls
 * {@see Uninstaller::uninstall()}.
 *
 * Data is KEPT by default (1.0.40): deleting the plugin — often just a
 * step in a manual reinstall — must not destroy every user's
 * signatures. Always removed: capabilities, the cron event and
 * `imgsig_*` transients. Only when the site option
 * `imgsig_delete_data_on_uninstall` is true (site-settings REST field
 * `delete_data_on_uninstall`) is everything purged: stored files
 * (Media Library attachments created by the plugin and objects in the
 * active S3 bucket), the `imgsig_*` tables, options and user meta.
 *
 * On multisite every site is processed with its own setting.
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
		'imgsig_rate_limits',
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
		'imgsig_storage_decrypt_error',
		'imgsig_settings',
		'imgsig_brand_palette',
		'imgsig_brand_kit',
		'imgsig_compliance_footer',
		'imgsig_banner_campaigns',
		'imgsig_frontend_access',
		'imgsig_delete_data_on_uninstall',
		'imgsig_upgrade_lock',
	];

	/**
	 * Assets processed per query while deleting stored files.
	 */
	private const BATCH = 200;

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
		if ( is_multisite() && function_exists( 'get_sites' ) ) {
			$purged_any = false;
			foreach ( get_sites(
				[
					'fields' => 'ids',
					'number' => 0,
				]
			) as $site_id ) {
				switch_to_blog( (int) $site_id );
				try {
					$purged_any = self::uninstall_site() || $purged_any;
				} finally {
					restore_current_blog();
				}
			}
			if ( $purged_any ) {
				self::delete_user_meta();
			}
		} elseif ( self::uninstall_site() ) {
			self::delete_user_meta();
		}

		/**
		 * Fires at the end of plugin uninstall.
		 *
		 * Note: this fires from `uninstall.php`, so listeners must be in
		 * code that's already loaded by WordPress core (e.g. mu-plugins).
		 *
		 * @since 1.0.0
		 */
		do_action( Actions::PLUGIN_UNINSTALLED );
	}

	/**
	 * Uninstalls on the current site.
	 *
	 * @since 1.0.40
	 *
	 * @return bool True when this site's data was purged.
	 */
	private static function uninstall_site(): bool {
		global $wpdb;

		$purge = (bool) (int) get_option( SiteSettingsController::OPT_DELETE_DATA_ON_UNINSTALL, 0 );

		// Always: plugin wiring that is meaningless without the plugin.
		self::remove_capabilities();
		wp_clear_scheduled_hook( Cron::DAILY_HOOK );
		self::delete_transients( $wpdb );

		if ( ! $purge ) {
			return false;
		}

		self::delete_stored_files( $wpdb );
		self::drop_tables( $wpdb );
		self::delete_options();

		return true;
	}

	/**
	 * Deletes every file the plugin stored for this site: Media Library
	 * attachments (asset rows + any attachment tagged `_imgsig_asset`),
	 * objects in the active S3 bucket, and the plugin's uploads
	 * sub-directory.
	 *
	 * @since 1.0.40
	 *
	 * @param \wpdb $wpdb DB.
	 *
	 * @return void
	 */
	private static function delete_stored_files( \wpdb $wpdb ): void {
		$table = $wpdb->prefix . 'imgsig_assets';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$has_table = null !== $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) );

		$s3 = null;
		try {
			$driver = ( new StorageManager( new Encryption() ) )->active_driver();
			$s3     = S3Driver::ID === $driver->get_id() ? $driver : null;
		} catch ( \Throwable $e ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[imagina-signatures] uninstall: S3 objects not deleted (driver unavailable): ' . $e->getMessage() );
		}

		$ml = new MediaLibraryDriver();

		if ( $has_table ) {
			$last_id = 0;
			do {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE id > %d ORDER BY id ASC LIMIT %d", $last_id, self::BATCH ), ARRAY_A );
				$rows       = is_array( $rows ) ? $rows : [];
				$batch_size = count( $rows );

				foreach ( $rows as $row ) {
					$asset   = Asset::from_row( $row );
					$last_id = $asset->id;
					try {
						if ( MediaLibraryDriver::ID === $asset->storage_driver ) {
							$ml->delete( $asset->storage_key );
						} elseif ( S3Driver::ID === $asset->storage_driver && null !== $s3 ) {
							$s3->delete( $asset->storage_key );
						}
					} catch ( \Throwable $e ) {
						// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
						error_log( '[imagina-signatures] uninstall: could not delete asset ' . $asset->id . ': ' . $e->getMessage() );
					}
				}
			} while ( $batch_size >= self::BATCH );
		}

		// Attachments tagged by the Media Library driver whose asset row
		// is already gone.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.SlowDBQuery
		$orphans = $wpdb->get_col( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = %s", MediaLibraryDriver::ATTACHMENT_META ) );
		foreach ( (array) $orphans as $attachment_id ) {
			wp_delete_attachment( (int) $attachment_id, true );
		}

		self::delete_uploads_directory();
	}

	/**
	 * Removes `wp-content/uploads/imagina-signatures/` (whatever is left
	 * after the attachments were deleted).
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	private static function delete_uploads_directory(): void {
		$uploads = wp_upload_dir( null, false );
		if ( ! empty( $uploads['error'] ) || empty( $uploads['basedir'] ) ) {
			return;
		}

		$base = realpath( (string) $uploads['basedir'] );
		$dir  = realpath( trailingslashit( (string) $uploads['basedir'] ) . MediaLibraryDriver::SUBDIR );
		if ( false === $base || false === $dir || 0 !== strpos( $dir, $base . DIRECTORY_SEPARATOR ) || ! is_dir( $dir ) ) {
			return;
		}

		$items = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS ),
			\RecursiveIteratorIterator::CHILD_FIRST
		);
		foreach ( $items as $item ) {
			if ( $item->isLink() || $item->isFile() ) {
				wp_delete_file( $item->getPathname() );
			} elseif ( $item->isDir() ) {
				@rmdir( $item->getPathname() ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
			}
		}
		@rmdir( $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
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
	 *     correctly per known key.
	 *  2. A safety-net SQL sweep that removes any remaining
	 *     `imgsig_*` row from `wp_options`.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private static function delete_options(): void {
		global $wpdb;

		foreach ( self::OPTIONS as $option ) {
			delete_option( $option );
		}

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
	 * Deletes the plugin's user meta (network-wide table).
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	private static function delete_user_meta(): void {
		delete_metadata( 'user', 0, UploadPolicy::TOKEN_META_KEY, '', true );
		delete_metadata( 'user', 0, InstallTokens::META_KEY, '', true );
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
	 * Covers rate-limit fallback counters, pending uploads and back-off
	 * markers.
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
