<?php
/**
 * Editor admin page (direct React mount).
 *
 * @package ImaginaSignatures\Admin\Pages
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin\Pages;

use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Renders the wp-admin page that hosts the React editor.
 *
 * No iframe — the editor mounts directly into a fixed-position
 * `#imagina-editor-root` container that covers the viewport.
 * wp-admin chrome is hidden via the inline `<style>` so the editor
 * effectively takes over the tab. Asset loading + the
 * `IMGSIG_EDITOR_CONFIG` bootstrap is handled by
 * {@see \ImaginaSignatures\Admin\EditorAssetEnqueuer}.
 *
 * Ownership for an existing signature is verified BEFORE rendering —
 * a user passing another user's `?id=` lands on a 403 instead of
 * loading the editor and discovering they can't read their own data.
 *
 * @since 1.0.0
 */
final class EditorPage {

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $repo;

	/**
	 * @param SignatureRepository $repo Signature repository for the ownership check.
	 */
	public function __construct( SignatureRepository $repo ) {
		$this->repo = $repo;
	}

	/**
	 * Renders the page body.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function render(): void {
		if ( ! current_user_can( CapabilitiesInstaller::CAP_USE ) ) {
			wp_die( esc_html__( 'You do not have permission to access the editor.', 'imagina-signatures' ) );
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$signature_id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$user_id      = get_current_user_id();

		if ( $signature_id > 0 ) {
			$signature = $this->repo->find_owned_by( $signature_id, $user_id );
			if ( null === $signature ) {
				wp_die(
					esc_html__( 'Signature not found or you do not have access to it.', 'imagina-signatures' ),
					'',
					[ 'response' => 403 ]
				);
			}
		}

		?>
		<style>
			#wpadminbar,
			#adminmenuwrap,
			#adminmenuback,
			#wpfooter,
			#screen-meta,
			#screen-meta-links,
			.update-nag,
			.notice { display: none !important; }
			html.wp-toolbar { padding-top: 0 !important; }
			#wpcontent,
			#wpbody,
			#wpbody-content { margin: 0 !important; padding: 0 !important; background: transparent !important; }
			html, body { background: #f7f8fa !important; overflow: hidden; }
		</style>
		<div id="imagina-editor-root"></div>
		<?php
	}
}
