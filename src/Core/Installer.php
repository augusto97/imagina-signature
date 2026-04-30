<?php
/**
 * Plugin install orchestrator.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Setup\DefaultTemplatesSeeder;
use ImaginaSignatures\Setup\SchemaMigrator;

defined( 'ABSPATH' ) || exit;

/**
 * Sets up persistent plugin state.
 *
 * Runs the steps that prepare the plugin's "world" on disk and in the
 * database: schema migrations, role capabilities, default options, and
 * the version stamp. Called by {@see Activator::activate()} during the
 * normal activation flow, but designed to be safe to invoke from
 * elsewhere too (CLI tools, recovery flows, or tests) — every step is
 * idempotent.
 *
 * Activator owns WP-specific lifecycle concerns (rewrite-rule flushing,
 * the `imgsig/plugin/activated` action). Installer owns plugin state.
 *
 * @since 1.0.0
 */
final class Installer {

	/**
	 * Default values for plugin options, mirroring CLAUDE.md §7.3.
	 *
	 * Seeded with `add_option()` only (never `update_option()`) so
	 * re-running install never clobbers configuration set by the user.
	 *
	 * @var array<string, mixed>
	 */
	private const DEFAULT_OPTIONS = [
		'imgsig_storage_driver' => 'media_library',
		'imgsig_storage_config' => '',
		'imgsig_settings'       => [
			'enable_logs'           => false,
			'rate_limit_uploads'    => 10,
			'rate_limit_signatures' => 30,
			'auto_compress_images'  => true,
		],
	];

	/**
	 * Runs every install step in order.
	 *
	 * Order matters: tables exist before anything else might query them,
	 * caps exist before any permission checks run, and the version stamp
	 * goes last so a half-finished install isn't recorded as complete.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function install(): void {
		global $wpdb;

		( new SchemaMigrator() )->migrate();
		( new CapabilitiesInstaller() )->install();

		$this->seed_default_options();

		// Seed shipped templates (idempotent — skips slugs that already exist).
		( new DefaultTemplatesSeeder( new TemplateRepository( $wpdb ) ) )->seed();

		// Always overwrite — we want the option to reflect the version that
		// last ran the installer, not the version that first did.
		update_option( 'imgsig_version', IMGSIG_VERSION );
	}

	/**
	 * Seeds default options without overwriting existing values.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private function seed_default_options(): void {
		foreach ( self::DEFAULT_OPTIONS as $name => $value ) {
			add_option( $name, $value );
		}
	}
}
