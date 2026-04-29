<?php
/**
 * `admin-post.php` fallback for the setup wizard.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Persists setup-wizard choices via `admin-post.php`.
 *
 * The primary path goes through the REST API. This handler exists as a
 * defensive net for hosts that block `/wp-json/` (Wordfence default rules,
 * iThemes Security in lockdown mode, hosts that strip Authorization
 * headers). The wizard form falls back to a real form submit when the
 * REST request fails.
 *
 * @since 1.0.1
 */
final class SetupFallback {

	public const ACTION = 'imgsig_setup_save';
	public const NONCE  = 'imgsig_setup_nonce';

	/**
	 * Hooks into `admin_post_*`.
	 *
	 * @return void
	 */
	public function register(): void {
		add_action( 'admin_post_' . self::ACTION, [ $this, 'handle' ] );
	}

	/**
	 * Validates and stores the setup choices, then redirects.
	 *
	 * @return void
	 */
	public function handle(): void {
		if ( ! current_user_can( 'imgsig_admin' ) && ! current_user_can( 'manage_options' ) ) {
			wp_die(
				esc_html__( 'You are not allowed to do that.', 'imagina-signatures' ),
				'',
				[ 'response' => 403, 'back_link' => true ]
			);
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		$nonce = isset( $_POST['_wpnonce'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['_wpnonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, self::NONCE ) ) {
			wp_die(
				esc_html__( 'Security check failed. Reload the setup page and try again.', 'imagina-signatures' ),
				'',
				[ 'response' => 403, 'back_link' => true ]
			);
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		$mode   = isset( $_POST['mode'] ) ? sanitize_key( wp_unslash( (string) $_POST['mode'] ) ) : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		$driver = isset( $_POST['storage_driver'] ) ? sanitize_key( wp_unslash( (string) $_POST['storage_driver'] ) ) : '';

		if ( in_array( $mode, [ 'single', 'multi' ], true ) ) {
			update_option( 'imgsig_mode', $mode, false );
		}
		if ( in_array( $driver, [ 'media_library', 's3' ], true ) ) {
			update_option( 'imgsig_storage_driver', $driver, false );
		}

		update_option( 'imgsig_setup_completed', true, false );

		do_action( 'imgsig/setup/completed', [ 'mode' => $mode, 'driver' => $driver ] );

		wp_safe_redirect( admin_url( 'admin.php?page=imagina-signatures&imgsig_setup=done' ) );
		exit;
	}

	/**
	 * Returns the URL the wizard form should POST to.
	 *
	 * @return string
	 */
	public static function action_url(): string {
		return admin_url( 'admin-post.php' );
	}

	/**
	 * Returns a freshly-generated nonce for the form.
	 *
	 * @return string
	 */
	public static function nonce(): string {
		return wp_create_nonce( self::NONCE );
	}
}
