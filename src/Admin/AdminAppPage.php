<?php
/**
 * Mount point for the React admin app.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Api\Controllers\AdminAppController;

defined( 'ABSPATH' ) || exit;

/**
 * Renders the admin React app via a same-origin iframe.
 *
 * The wp-admin page itself only outputs:
 *   1. A small CSS rule that hides wp-admin chrome so the iframe
 *      can take the full viewport.
 *   2. An `<iframe>` pointing at the
 *      {@see \ImaginaSignatures\Api\Controllers\AdminAppController}
 *      REST endpoint, signed with a short-lived token.
 *
 * Why the iframe? wp-admin auto-loads `forms.css` / `common.css`
 * which apply default styles to native `<button>` and `<input>`
 * elements. Even with our Tailwind preflight disabled and
 * scoped utilities, those rules bleed through and produce the
 * grey-bordered "WP buttons" inside our React UI. The iframe
 * lives in its own document — only our `admin.css` is loaded —
 * so the React app paints clean.
 *
 * Capability is checked twice: once here (the wp-admin page
 * gate) and again in the REST controller when the token is
 * verified. Same defense-in-depth pattern as
 * {@see \ImaginaSignatures\Admin\Pages\EditorPage}.
 *
 * @since 1.0.0
 */
final class AdminAppPage {

	/**
	 * Page key passed to the React app (signatures / templates / settings).
	 *
	 * @var string
	 */
	private string $page;

	/**
	 * Capability the current user must hold to view this page.
	 *
	 * @var string
	 */
	private string $required_cap;

	/**
	 * @param string $page         Page key.
	 * @param string $required_cap Capability gating the page.
	 */
	public function __construct( string $page, string $required_cap ) {
		$this->page         = $page;
		$this->required_cap = $required_cap;
	}

	/**
	 * Renders the iframe host.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function render(): void {
		if ( ! current_user_can( $this->required_cap ) ) {
			wp_die(
				esc_html__( 'You do not have permission to access this page.', 'imagina-signatures' )
			);
		}

		$user_id    = get_current_user_id();
		$token      = AdminAppController::mint_token( $user_id, $this->page );
		$iframe_url = add_query_arg(
			[ 'token' => $token ],
			rest_url( 'imagina-signatures/v1/admin/app' )
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
			html, body { background: #f7f8fa !important; overflow: hidden; }
		</style>
		<iframe
			src="<?php echo esc_url( $iframe_url ); ?>"
			style="width:100vw;height:100vh;border:0;position:fixed;inset:0;z-index:100000;background:#f7f8fa;"
			title="<?php echo esc_attr__( 'Imagina Signatures', 'imagina-signatures' ); ?>"
		></iframe>
		<?php
	}
}
