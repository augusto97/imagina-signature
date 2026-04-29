<?php
/**
 * Schema migration 1.1.0 — plans, users, assets, usage, logs.
 *
 * @package ImaginaSignatures\Setup\Migrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup\Migrations;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Adds the tables introduced in Sprints 3 and 6.
 *
 * @since 1.0.0
 */
final class Migration_1_1_0 {

	public function up(): void {
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		global $wpdb;
		$cc = $wpdb->get_charset_collate();

		$assets = "CREATE TABLE {$wpdb->prefix}imgsig_assets (
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
		) {$cc};";

		$plans = "CREATE TABLE {$wpdb->prefix}imgsig_plans (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			slug VARCHAR(100) NOT NULL,
			name VARCHAR(255) NOT NULL,
			description TEXT NULL,
			limits_json LONGTEXT NOT NULL,
			is_default TINYINT(1) NOT NULL DEFAULT 0,
			is_active TINYINT(1) NOT NULL DEFAULT 1,
			sort_order INT NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY uniq_slug (slug),
			KEY idx_active_default (is_active, is_default)
		) {$cc};";

		$user_plans = "CREATE TABLE {$wpdb->prefix}imgsig_user_plans (
			user_id BIGINT UNSIGNED NOT NULL,
			plan_id BIGINT UNSIGNED NOT NULL,
			assigned_at DATETIME NOT NULL,
			expires_at DATETIME NULL,
			metadata LONGTEXT NULL,
			PRIMARY KEY  (user_id),
			KEY idx_plan (plan_id),
			KEY idx_expires (expires_at)
		) {$cc};";

		$usage = "CREATE TABLE {$wpdb->prefix}imgsig_usage (
			user_id BIGINT UNSIGNED NOT NULL,
			signatures_count INT UNSIGNED NOT NULL DEFAULT 0,
			storage_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
			last_activity_at DATETIME NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (user_id)
		) {$cc};";

		$logs = "CREATE TABLE {$wpdb->prefix}imgsig_logs (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			user_id BIGINT UNSIGNED NULL,
			event_type VARCHAR(100) NOT NULL,
			event_data LONGTEXT NULL,
			ip_address VARCHAR(45) NULL,
			user_agent TEXT NULL,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY idx_user_event (user_id, event_type),
			KEY idx_created (created_at),
			KEY idx_event (event_type)
		) {$cc};";

		dbDelta( $assets );
		dbDelta( $plans );
		dbDelta( $user_plans );
		dbDelta( $usage );
		dbDelta( $logs );
	}
}
