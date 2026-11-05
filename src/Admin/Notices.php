<?php
/**
 * Plugin admin notices.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Storage\StorageManager;

defined( 'ABSPATH' ) || exit;

/**
 * Admin notices that aren't tied to a single page.
 *
 * Currently one: stored S3 credentials that can no longer be decrypted
 * (flagged by {@see StorageManager::read_active_config()}), which
 * otherwise surfaces only as uploads mysteriously failing.
 *
 * @since 1.0.40
 */
final class Notices {

	/**
	 * Hooks the notices.
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'admin_notices', [ $this, 'render_storage_decrypt_notice' ] );
	}

	/**
	 * Renders the "credentials could not be decrypted" notice for
	 * storage admins.
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	public function render_storage_decrypt_notice(): void {
		if ( ! current_user_can( CapabilitiesInstaller::CAP_MANAGE_STORAGE ) ) {
			return;
		}

		if ( false === get_option( StorageManager::OPTION_DECRYPT_ERROR, false ) ) {
			return;
		}

		// Nothing to warn about once there's no encrypted blob left.
		if ( '' === (string) get_option( StorageManager::OPTION_CONFIG, '' ) ) {
			return;
		}

		$settings_url = admin_url( 'admin.php?page=' . AdminMenu::SETTINGS_SLUG );

		printf(
			'<div class="notice notice-error"><p><strong>%1$s</strong> %2$s <a href="%3$s">%4$s</a></p></div>',
			esc_html__( 'Imagina Signatures:', 'imagina-signatures' ),
			esc_html__( 'Storage credentials could not be decrypted — WordPress salts may have changed; re-enter them in Settings → Storage.', 'imagina-signatures' ),
			esc_url( $settings_url ),
			esc_html__( 'Open storage settings', 'imagina-signatures' )
		);
	}
}
