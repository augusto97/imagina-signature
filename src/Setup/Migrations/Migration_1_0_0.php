<?php
/**
 * Initial schema migration (1.0.0).
 *
 * @package ImaginaSignatures\Setup\Migrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup\Migrations;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Creates the baseline set of tables required for Sprint 1.
 *
 * Sprint 1 only ships the `signatures` and `templates` tables — additional
 * tables (`assets`, `plans`, `user_plans`, `usage`, `logs`) are introduced in
 * later migrations as their owning sprints land. This keeps the install
 * surface small while the data model is still being validated.
 *
 * @since 1.0.0
 */
final class Migration_1_0_0 {

	/**
	 * Applies the migration. Uses `dbDelta` so it stays idempotent.
	 *
	 * @since 1.0.0
	 */
	public function up(): void {
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		global $wpdb;
		$charset_collate = $wpdb->get_charset_collate();

		$signatures = "CREATE TABLE {$wpdb->prefix}imgsig_signatures (
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

		$templates = "CREATE TABLE {$wpdb->prefix}imgsig_templates (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			slug VARCHAR(100) NOT NULL,
			name VARCHAR(255) NOT NULL,
			category VARCHAR(100) NOT NULL DEFAULT 'general',
			description TEXT NULL,
			preview_url TEXT NULL,
			json_content LONGTEXT NOT NULL,
			is_premium TINYINT(1) NOT NULL DEFAULT 0,
			is_system TINYINT(1) NOT NULL DEFAULT 0,
			sort_order INT NOT NULL DEFAULT 0,
			schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY uniq_slug (slug),
			KEY idx_category (category, is_premium)
		) {$charset_collate};";

		dbDelta( $signatures );
		dbDelta( $templates );
	}
}
