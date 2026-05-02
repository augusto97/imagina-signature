<?php
/**
 * Plugin activation entry point.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Hooks\Actions;

defined( 'ABSPATH' ) || exit;

/**
 * Runs once when the plugin is activated.
 *
 * Owns WP-specific lifecycle concerns and delegates the actual install
 * steps to {@see Installer}. Responsibilities:
 *
 *  - Verify the host meets minimum requirements (defensive — the main
 *    plugin file already self-deactivates on unsupported hosts, but
 *    `register_activation_hook` runs before that bailout, so we re-check).
 *  - Delegate persistent-state setup to {@see Installer::install()}.
 *  - Flush rewrite rules so REST routes register cleanly.
 *  - Fire the `imgsig/plugin/activated` action.
 *
 * Activation runs synchronously _before_ `plugins_loaded`, which means
 * `Plugin::boot()` has not yet run and DI bindings are not available.
 * Therefore everything here must work with directly-instantiated objects
 * and core WordPress functions only.
 *
 * @since 1.0.0
 */
final class Activator {

	/**
	 * Activation handler.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public static function activate(): void {
		if ( ! self::meets_requirements() ) {
			deactivate_plugins( IMGSIG_BASENAME );
			wp_die(
				esc_html__(
					'Imagina Signatures requires PHP 7.4 or higher and WordPress 6.0 or higher.',
					'imagina-signatures'
				),
				esc_html__( 'Plugin activation failed', 'imagina-signatures' ),
				[ 'back_link' => true ]
			);
		}

		// Wrap the install steps so a failing migration / seeder doesn't
		// leave the plugin half-activated with an opaque PHP fatal in
		// the user's face. We catch ANY throwable, surface it as a
		// stored option that the admin notice picks up, and rethrow
		// only the message in `wp_die` so the user gets actionable text
		// instead of "There has been a critical error on this website."
		try {
			( new Installer() )->install();
		} catch ( \Throwable $e ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[imagina-signatures] activation failed: ' . $e->getMessage() . "\n" . $e->getTraceAsString() );
			deactivate_plugins( IMGSIG_BASENAME );
			wp_die(
				esc_html(
					sprintf(
						/* translators: %s: error message. */
						__( 'Imagina Signatures could not finish activating: %s. The plugin has been deactivated. Check the WordPress error log for the full stack trace.', 'imagina-signatures' ),
						$e->getMessage()
					)
				),
				esc_html__( 'Plugin activation failed', 'imagina-signatures' ),
				[ 'back_link' => true ]
			);
		}

		// `flush_rewrite_rules()` was removed in 1.0.26 — REST routes
		// don't use rewrite rules, so the call was dead weight that
		// rebuilt the entire permalink cache on every (de)activation.

		/**
		 * Fires after the plugin has finished activating.
		 *
		 * @since 1.0.0
		 */
		do_action( Actions::PLUGIN_ACTIVATED );
	}

	/**
	 * Returns true when the host meets the plugin's minimum requirements.
	 *
	 * Mirrors `imgsig_meets_requirements()` in the main plugin file. Kept
	 * here for activation-time defense, since activation runs before the
	 * main file has had a chance to self-deactivate.
	 *
	 * @since 1.0.0
	 *
	 * @return bool
	 */
	private static function meets_requirements(): bool {
		global $wp_version;

		if ( version_compare( PHP_VERSION, IMGSIG_MIN_PHP, '<' ) ) {
			return false;
		}

		if ( isset( $wp_version ) && version_compare( $wp_version, IMGSIG_MIN_WP, '<' ) ) {
			return false;
		}

		return true;
	}
}
