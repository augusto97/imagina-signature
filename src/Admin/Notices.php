<?php
/**
 * Admin notices manager.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Coordinates plugin admin notices.
 *
 * Notices are stored in a per-user transient and rendered once. Critical
 * notices (e.g. setup not completed) are produced on the fly each request.
 *
 * @since 1.0.0
 */
final class Notices {

	/**
	 * Hooks notice rendering.
	 *
	 * @return void
	 */
	public function register(): void {
		add_action( 'admin_notices', [ $this, 'render' ] );
	}

	/**
	 * Adds a one-shot notice for the current user.
	 *
	 * @param string $message Translated message.
	 * @param string $type    `success`, `warning`, `error`, `info`.
	 *
	 * @return void
	 */
	public static function add( string $message, string $type = 'info' ): void {
		$user_id = get_current_user_id();
		if ( ! $user_id ) {
			return;
		}
		$queue   = get_transient( 'imgsig_notices_' . $user_id );
		$queue   = is_array( $queue ) ? $queue : [];
		$queue[] = [ 'message' => $message, 'type' => $type ];
		set_transient( 'imgsig_notices_' . $user_id, $queue, MINUTE_IN_SECONDS * 10 );
	}

	/**
	 * Renders queued and on-the-fly notices.
	 *
	 * @return void
	 */
	public function render(): void {
		$user_id = get_current_user_id();
		if ( $user_id ) {
			$queue = get_transient( 'imgsig_notices_' . $user_id );
			if ( is_array( $queue ) ) {
				foreach ( $queue as $notice ) {
					$type    = isset( $notice['type'] ) ? (string) $notice['type'] : 'info';
					$message = isset( $notice['message'] ) ? (string) $notice['message'] : '';
					$this->print_notice( $message, $type );
				}
				delete_transient( 'imgsig_notices_' . $user_id );
			}
		}

		if ( current_user_can( 'imgsig_admin' ) && ! get_option( 'imgsig_setup_completed', false ) ) {
			$url = esc_url( admin_url( 'admin.php?page=imagina-signatures-setup' ) );
			$this->print_notice(
				sprintf(
					/* translators: %s: setup URL. */
					__( 'Imagina Signatures needs initial configuration. <a href="%s">Run the setup wizard</a>.', 'imagina-signatures' ),
					$url
				),
				'warning',
				false
			);
		}
	}

	/**
	 * Echoes a single notice.
	 *
	 * @param string $message     Allowed message HTML.
	 * @param string $type        Notice type.
	 * @param bool   $dismissible Whether to render the dismiss button.
	 *
	 * @return void
	 */
	private function print_notice( string $message, string $type, bool $dismissible = true ): void {
		$class = 'notice notice-' . sanitize_html_class( $type );
		if ( $dismissible ) {
			$class .= ' is-dismissible';
		}
		echo '<div class="' . esc_attr( $class ) . '"><p>' . wp_kses_post( $message ) . '</p></div>';
	}
}
