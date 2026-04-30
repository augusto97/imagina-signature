<?php
/**
 * Mount point for the React admin app.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

defined( 'ABSPATH' ) || exit;

/**
 * Renders the admin React app directly into the wp-admin page.
 *
 * The React tree paints into a fixed-position `#imagina-admin-root`
 * div that covers the viewport. Asset loading and config injection
 * are handled by {@see AdminAssetEnqueuer} on the
 * `admin_enqueue_scripts` hook for our specific page hook suffixes —
 * this class is responsible only for the markup the page outputs.
 *
 * The Tailwind preflight + scoped resets in `assets/admin/src/styles/
 * globals.css` win specificity against wp-admin's `forms.css`, so
 * native form elements paint with our design language without being
 * isolated in an iframe.
 *
 * @since 1.0.0
 */
final class AdminAppPage {

	/**
	 * Capability the current user must hold to view this page.
	 *
	 * @var string
	 */
	private string $required_cap;

	/**
	 * @param string $required_cap Capability gating the page.
	 */
	public function __construct( string $required_cap ) {
		$this->required_cap = $required_cap;
	}

	/**
	 * Renders the React mount point.
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

		// The container covers the viewport (CSS: position:fixed; inset:0;
		// z-index:99999) — see globals.css. We hide wp-admin chrome below
		// it so there's no flicker / double-scroll. The chrome is still in
		// the DOM (so plugins/admin-bar items keep working) but visually
		// gone for the duration of this page.
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
		<div id="imagina-admin-root"></div>
		<?php
	}
}
