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

		$this->maybe_render_quota_notice();
	}

	/**
	 * Renders a "you're close to your plan limit" notice when applicable.
	 *
	 * Read-only — never throws if the quota services aren't bound (e.g. in
	 * isolated unit tests).
	 *
	 * @return void
	 */
	private function maybe_render_quota_notice(): void {
		if ( ! is_user_logged_in() ) {
			return;
		}
		if ( 'multi' !== (string) get_option( 'imgsig_mode', 'single' ) ) {
			return;
		}

		$plugin = function_exists( 'imgsig_plugin' ) ? imgsig_plugin() : null;
		if ( ! $plugin instanceof \ImaginaSignatures\Core\Plugin ) {
			return;
		}
		$container = $plugin->container();
		if ( ! $container->has( '\\ImaginaSignatures\\Services\\QuotaEnforcer' )
			|| ! $container->has( '\\ImaginaSignatures\\Repositories\\UsageRepository' ) ) {
			return;
		}

		try {
			$quota = $container->make( '\\ImaginaSignatures\\Services\\QuotaEnforcer' );
			$usage = $container->make( '\\ImaginaSignatures\\Repositories\\UsageRepository' );
			$user  = get_current_user_id();
			$plan  = $quota->plan_for_user( $user );
			$rec   = $usage->get_for_user( $user );

			if ( $plan->limits->max_signatures > 0
				&& $rec->signatures_count >= (int) ( 0.9 * $plan->limits->max_signatures )
				&& $rec->signatures_count < $plan->limits->max_signatures ) {
				$this->print_notice(
					sprintf(
						/* translators: 1: count, 2: max. */
						__( 'You have used %1$d of %2$d signatures on your plan.', 'imagina-signatures' ),
						$rec->signatures_count,
						$plan->limits->max_signatures
					),
					'warning',
					false
				);
			}
		} catch ( \Throwable $e ) {
			// Notices must never throw.
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
