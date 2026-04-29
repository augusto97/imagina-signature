<?php
/**
 * Initial schema migration.
 *
 * @package ImaginaSignatures\Setup\Migrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup\Migrations;

defined( 'ABSPATH' ) || exit;

/**
 * Creates the three core tables: `imgsig_signatures`, `imgsig_templates`,
 * `imgsig_assets`. Schema mirrors CLAUDE.md §7.1.
 *
 * Notes about dbDelta:
 *  - Each statement is one CREATE TABLE; dbDelta diffs the existing schema
 *    and emits ALTER TABLE for differences.
 *  - PRIMARY KEY needs two spaces before the parenthesis.
 *  - Use `KEY`, not `INDEX`.
 *  - `DESC` on indexes is ignored by dbDelta on most MySQL/MariaDB
 *    versions, so we list indexes ascending only — the optimizer can use
 *    them in either direction.
 *  - We model `status` as `VARCHAR(20)` instead of `ENUM` because
 *    dbDelta's diff logic mishandles ENUM column comparisons and would
 *    issue redundant ALTER TABLE on every run. Application code (status
 *    constants on the model) enforces the allowed set: `draft`, `ready`,
 *    `archived`.
 *
 * @since 1.0.0
 */
final class Migration_1_0_0 {

	/**
	 * Applies the migration.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function up(): void {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset_collate = $wpdb->get_charset_collate();
		$prefix          = $wpdb->prefix;

		dbDelta( $this->signatures_sql( $prefix, $charset_collate ) );
		dbDelta( $this->templates_sql( $prefix, $charset_collate ) );
		dbDelta( $this->assets_sql( $prefix, $charset_collate ) );
	}

	/**
	 * SQL for the user-scoped signatures table.
	 *
	 * @since 1.0.0
	 *
	 * @param string $prefix          The WordPress table prefix.
	 * @param string $charset_collate The site's charset/collate clause.
	 *
	 * @return string
	 */
	private function signatures_sql( string $prefix, string $charset_collate ): string {
		return "CREATE TABLE {$prefix}imgsig_signatures (
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
			KEY idx_template (template_id)
		) {$charset_collate};";
	}

	/**
	 * SQL for the global templates table.
	 *
	 * @since 1.0.0
	 *
	 * @param string $prefix          The WordPress table prefix.
	 * @param string $charset_collate The site's charset/collate clause.
	 *
	 * @return string
	 */
	private function templates_sql( string $prefix, string $charset_collate ): string {
		return "CREATE TABLE {$prefix}imgsig_templates (
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
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY uniq_slug (slug),
			KEY idx_category (category)
		) {$charset_collate};";
	}

	/**
	 * SQL for the user-scoped assets table.
	 *
	 * @since 1.0.0
	 *
	 * @param string $prefix          The WordPress table prefix.
	 * @param string $charset_collate The site's charset/collate clause.
	 *
	 * @return string
	 */
	private function assets_sql( string $prefix, string $charset_collate ): string {
		return "CREATE TABLE {$prefix}imgsig_assets (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			user_id BIGINT UNSIGNED NOT NULL,
			storage_driver VARCHAR(50) NOT NULL,
			storage_key TEXT NOT NULL,
			public_url TEXT NOT NULL,
			mime_type VARCHAR(100) NOT NULL,
			size_bytes BIGINT UNSIGNED NOT NULL,
			width INT UNSIGNED NULL,
			height INT UNSIGNED NULL,
			hash_sha256 CHAR(64) NOT NULL,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY idx_user_created (user_id, created_at),
			KEY idx_hash (hash_sha256)
		) {$charset_collate};";
	}
}
