<?php
/**
 * Plugin activation handler.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Setup\DefaultPlansSeeder;
use ImaginaSignatures\Setup\RolesInstaller;
use ImaginaSignatures\Setup\SchemaMigrator;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Runs the work required when the plugin is activated.
 *
 * Activation must be safe to run multiple times: WordPress invokes it on
 * every reactivation and after upgrades that add new tables or capabilities.
 *
 * @since 1.0.0
 */
final class Activator {

	/**
	 * Activation entry point. Called by `register_activation_hook`.
	 *
	 * @since 1.0.0
	 */
	public static function activate(): void {
		self::ensure_environment();

		( new SchemaMigrator() )->migrate();
		( new RolesInstaller() )->install();
		( new DefaultPlansSeeder() )->seed();

		self::seed_default_options();

		update_option( 'imgsig_version', IMGSIG_VERSION, false );
		update_option( 'imgsig_activated_at', gmdate( 'Y-m-d H:i:s' ), false );

		/**
		 * Fires after the plugin has been activated.
		 *
		 * @since 1.0.0
		 */
		do_action( 'imgsig/plugin/activated' );

		flush_rewrite_rules( false );
	}

	/**
	 * Aborts activation if the host environment is not supported.
	 *
	 * @since 1.0.0
	 */
	private static function ensure_environment(): void {
		if ( version_compare( PHP_VERSION, IMGSIG_MIN_PHP, '<' ) ) {
			deactivate_plugins( IMGSIG_PLUGIN_BASENAME );
			wp_die(
				esc_html(
					sprintf(
						/* translators: %s: minimum PHP version. */
						__( 'Imagina Signatures requires PHP %s or higher.', 'imagina-signatures' ),
						IMGSIG_MIN_PHP
					)
				),
				esc_html__( 'Plugin activation error', 'imagina-signatures' ),
				[ 'back_link' => true ]
			);
		}

		global $wp_version;
		if ( isset( $wp_version ) && version_compare( $wp_version, IMGSIG_MIN_WP, '<' ) ) {
			deactivate_plugins( IMGSIG_PLUGIN_BASENAME );
			wp_die(
				esc_html(
					sprintf(
						/* translators: %s: minimum WordPress version. */
						__( 'Imagina Signatures requires WordPress %s or higher.', 'imagina-signatures' ),
						IMGSIG_MIN_WP
					)
				),
				esc_html__( 'Plugin activation error', 'imagina-signatures' ),
				[ 'back_link' => true ]
			);
		}
	}

	/**
	 * Writes the default options if they don't exist yet.
	 *
	 * Uses `add_option` so re-activation does not clobber user customizations.
	 *
	 * @since 1.0.0
	 */
	private static function seed_default_options(): void {
		add_option( 'imgsig_schema_version', '0.0.0', '', false );
		add_option( 'imgsig_mode', 'single', '', false );
		add_option( 'imgsig_storage_driver', 'media_library', '', false );
		add_option( 'imgsig_storage_config', [], '', false );
		add_option(
			'imgsig_branding',
			[
				'custom_logo_url' => '',
			],
			'',
			false
		);
		add_option( 'imgsig_default_plan_id', 0, '', false );
		add_option( 'imgsig_setup_completed', false, '', false );
		add_option(
			'imgsig_settings',
			[
				'enable_logs'           => false,
				'rate_limit_uploads'    => 10,
				'rate_limit_signatures' => 20,
				'auto_compress_images'  => true,
				'preview_clients'       => [ 'gmail', 'outlook', 'apple_mail' ],
			],
			'',
			false
		);
	}
}
