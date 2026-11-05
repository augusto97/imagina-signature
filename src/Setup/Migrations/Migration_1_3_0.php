<?php
/**
 * Schema migration: 1.3.0 — server-held compiled HTML.
 *
 * @package ImaginaSignatures\Setup\Migrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup\Migrations;

defined( 'ABSPATH' ) || exit;

/**
 * Adds the columns that let the server hold each signature's compiled
 * output, so it can be deployed (Gmail API, Outlook add-in, install
 * links) without the employee's browser:
 *
 *  - `html_text`   plain-text alternative of the compiled signature.
 *  - `html_hash`   SHA-256 of `html_cache`, used to skip redundant pushes.
 *  - `compiled_at` UTC time the browser last compiled it. A row whose
 *                  `compiled_at` is older than `updated_at` is stale.
 *
 * `html_cache` already exists (1.0.0) and now holds the signature
 * fragment (the outer table, no document wrapper).
 *
 * @since 1.3.0
 */
final class Migration_1_3_0 {

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

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		dbDelta(
			"CREATE TABLE {$prefix}imgsig_signatures (
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
	}
}
