<?php
/**
 * Schema migration: 1.5.0 — signatures linked to a template.
 *
 * @package ImaginaSignatures\Setup\Migrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup\Migrations;

defined( 'ABSPATH' ) || exit;

/**
 * Adds `link_mode` to `imgsig_signatures`:
 *
 *  - `detached` (default) — the signature is the user's own design. Rows
 *                           created before 1.3.0 and template copies.
 *  - `linked`             — the design (canvas + blocks) always comes from
 *                           `template_id`; the user's data lives in the
 *                           signature's `variables` (plus per-block text
 *                           `overrides` in `locked_design` mode). Template
 *                           updates are propagated to these rows.
 *
 * dbDelta needs the full CREATE TABLE, so every column and index from
 * {@see Migration_1_3_0} is repeated here, plus `idx_template_link` for
 * the propagation query (`template_id = ? AND link_mode = 'linked'`).
 *
 * @since 1.3.0
 */
final class Migration_1_5_0 {

	/**
	 * Apply the migration. Idempotent: dbDelta only adds what is missing.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function up(): void {
		global $wpdb;

		$prefix          = $wpdb->prefix;
		$charset_collate = $wpdb->get_charset_collate();

		if ( ! function_exists( 'dbDelta' ) ) {
			require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		}

		dbDelta( self::signatures_table_sql( $prefix, $charset_collate ) );
	}

	/**
	 * The `imgsig_signatures` definition as of 1.5.0.
	 *
	 * @since 1.3.0
	 *
	 * @param string $prefix          Table prefix.
	 * @param string $charset_collate Charset / collation clause.
	 *
	 * @return string
	 */
	public static function signatures_table_sql( string $prefix, string $charset_collate ): string {
		return "CREATE TABLE {$prefix}imgsig_signatures (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			user_id BIGINT UNSIGNED NOT NULL,
			name VARCHAR(255) NOT NULL,
			json_content LONGTEXT NOT NULL,
			html_cache LONGTEXT NULL,
			html_text LONGTEXT NULL,
			html_hash CHAR(64) NULL,
			compiled_at DATETIME NULL,
			preview_url TEXT NULL,
			template_id BIGINT UNSIGNED NULL,
			link_mode VARCHAR(20) NOT NULL DEFAULT 'detached',
			status VARCHAR(20) NOT NULL DEFAULT 'draft',
			schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY idx_user_updated (user_id, updated_at),
			KEY idx_status (status),
			KEY idx_template (template_id),
			KEY idx_template_user (template_id, user_id),
			KEY idx_template_link (template_id, link_mode)
		) {$charset_collate};";
	}
}
