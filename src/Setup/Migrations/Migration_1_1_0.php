<?php
/**
 * Schema migration: 1.1.0 — add `visible_to_roles` to imgsig_templates.
 *
 * @package ImaginaSignatures\Setup\Migrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup\Migrations;

defined( 'ABSPATH' ) || exit;

/**
 * Adds a `visible_to_roles` column to `imgsig_templates` so admins
 * can scope templates to specific WordPress roles.
 *
 * Format: comma-separated role slugs (e.g. `"editor,author"`),
 * `NULL` or `''` = visible to everyone with `imgsig_use_signatures`.
 *
 * dbDelta is idempotent — the migration is safe to re-run on an
 * already-migrated database (it diffs the live schema against the
 * full CREATE TABLE statement and only emits the missing column).
 *
 * @since 1.1.0
 */
final class Migration_1_1_0 {

	/**
	 * Apply the migration.
	 *
	 * @since 1.1.0
	 *
	 * @return void
	 */
	public function up(): void {
		global $wpdb;

		$prefix          = $wpdb->prefix;
		$charset_collate = $wpdb->get_charset_collate();

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		// Re-emit the full CREATE TABLE so dbDelta can diff and add the
		// new `visible_to_roles` column without touching the others.
		$sql = "CREATE TABLE {$prefix}imgsig_templates (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			slug VARCHAR(100) NOT NULL,
			name VARCHAR(255) NOT NULL,
			category VARCHAR(100) NOT NULL DEFAULT 'general',
			description TEXT NULL,
			preview_url TEXT NULL,
			json_content LONGTEXT NOT NULL,
			is_system TINYINT(1) NOT NULL DEFAULT 0,
			sort_order INT NOT NULL DEFAULT 0,
			schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
			visible_to_roles VARCHAR(500) NULL DEFAULT NULL,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY uniq_slug (slug),
			KEY idx_category (category)
		) {$charset_collate};";

		dbDelta( $sql );
	}
}
