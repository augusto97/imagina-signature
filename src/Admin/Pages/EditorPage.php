<?php
/**
 * Editor admin page (iframe mount point).
 *
 * @package ImaginaSignatures\Admin\Pages
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin\Pages;

use ImaginaSignatures\Api\Controllers\EditorIframeController;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Renders the wp-admin page that hosts the editor iframe.
 *
 * The page itself is bare — it just outputs a full-viewport `<iframe>`
 * pointing at `/wp-json/imagina-signatures/v1/editor/iframe?token=...`.
 * The visible chrome (admin-bar, side-menu, footer) is hidden via
 * inline CSS so the editor effectively takes over the whole tab,
 * matching the Framer / Webflow UX (CLAUDE.md §3.3 / §14.1).
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

		$token      = EditorIframeController::mint_token( $user_id, $signature_id );
		$iframe_url = add_query_arg(
			[ 'token' => $token ],
			rest_url( EditorIframeController::NAMESPACE . '/editor/iframe' )
		);

		?>
		<style>
			#wpadminbar,
			#adminmenuwrap,
			#adminmenuback,
			#wpfooter { display: none !important; }
			html.wp-toolbar { padding-top: 0 !important; }
			#wpcontent,
			#wpbody-content { margin: 0 !important; padding: 0 !important; }
			html, body { background: #fafafa; overflow: hidden; }
		</style>
		<div class="imagina-signatures-editor-frame">
			<iframe
				src="<?php echo esc_url( $iframe_url ); ?>"
				style="width:100vw;height:100vh;border:0;position:fixed;inset:0;z-index:100000;background:#fafafa;"
				allow="clipboard-write"
				title="<?php echo esc_attr__( 'Imagina Signatures Editor', 'imagina-signatures' ); ?>"
			></iframe>
		</div>
		<?php
	}
}
