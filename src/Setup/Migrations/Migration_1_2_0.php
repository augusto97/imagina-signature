<?php
/**
 * Schema migration: 1.2.0 — rate-limit table + signature index.
 *
 * @package ImaginaSignatures\Setup\Migrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup\Migrations;

defined( 'ABSPATH' ) || exit;

/**
 * Three changes, all idempotent:
 *
 *  1. Creates `{prefix}imgsig_rate_limits` — one row per rate-limit
 *     bucket, incremented atomically with `INSERT … ON DUPLICATE KEY
 *     UPDATE` (see {@see \ImaginaSignatures\Security\RateLimitStore}).
 *     `window_start` is the Unix timestamp of the fixed window the
 *     `hits` counter belongs to; a hit in a newer window resets it.
 *  2. Adds the composite index `idx_template_user (template_id, user_id)`
 *     on `imgsig_signatures`, which backs the bulk-apply "user already
 *     has a signature from this template" probe.
 *  3. Flips `imgsig_frontend_access` to autoload: it's read on every
 *     `init` (rewrite registration), so a separate query per request
 *     was pure overhead.
 *
 * @since 1.2.0
 */
final class Migration_1_2_0 {

	/**
	 * Apply the migration.
	 *
	 * @since 1.2.0
	 *
	 * @return void
	 */
	public function up(): void {
		global $wpdb;

		$prefix          = $wpdb->prefix;
		$charset_collate = $wpdb->get_charset_collate();

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		dbDelta(
			"CREATE TABLE {$prefix}imgsig_rate_limits (
			rl_key VARCHAR(191) NOT NULL,
			window_start INT UNSIGNED NOT NULL DEFAULT 0,
			hits INT UNSIGNED NOT NULL DEFAULT 0,
			PRIMARY KEY  (rl_key),
			KEY idx_window (window_start)
		) {$charset_collate};"
		);

		// Full CREATE TABLE so dbDelta can diff in the new index without
		// touching the existing columns.
		dbDelta(
			"CREATE TABLE {$prefix}imgsig_signatures (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			user_id BIGINT UNSIGNED NOT NULL,
			name VARCHAR(255) NOT NULL,
			json_content LONGTEXT NOT NULL,
			html_cache LONGTEXT NULL,
			preview_url TEXT NULL,
			template_id BIGINT UNSIGNED NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'draft',
			schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY idx_user_updated (user_id, updated_at),
			KEY idx_status (status),
			KEY idx_template (template_id),
			KEY idx_template_user (template_id, user_id)
		) {$charset_collate};"
		);

		$this->autoload_frontend_access();
	}

	/**
	 * Marks `imgsig_frontend_access` as autoloaded.
	 *
	 * @since 1.2.0
	 *
	 * @return void
	 */
	private function autoload_frontend_access(): void {
		$option = 'imgsig_frontend_access';

		if ( false === get_option( $option, false ) ) {
			return;
		}

		if ( function_exists( 'wp_set_option_autoload' ) ) {
			// WP 6.4+.
			wp_set_option_autoload( $option, true );
			return;
		}

		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- one-off migration on a core table column WP < 6.4 has no API for.
		$wpdb->update(
			$wpdb->options,
			[ 'autoload' => 'yes' ],
			[ 'option_name' => $option ],
			[ '%s' ],
			[ '%s' ]
		);
		wp_cache_delete( 'alloptions', 'options' );
		wp_cache_delete( $option, 'options' );
	}
}
