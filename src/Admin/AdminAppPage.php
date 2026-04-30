<?php
/**
 * Mount point for the React admin app.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Renders the React admin app for one of the three "pages" we expose
 * in the wp-admin menu (Signatures / Templates / Settings).
 *
 * The PHP side does three things:
 *   1. Hides the wp-admin chrome with inline CSS so the React app can
 *      take over the viewport (similar to {@see Pages\EditorPage}).
 *   2. Injects an `IMGSIG_ADMIN_CONFIG` global with REST nonce, user
 *      info, capability map, URLs to navigate between pages, and the
 *      "page" key so the React app knows which view to render.
 *   3. Outputs the mount point and loads `build/admin.js` / `admin.css`.
 *
 * The same PHP class is re-used for all three pages — the wp-admin
 * URL (`?page=imagina-signatures-...`) determines which `page` value
 * the config carries.
 *
 * @since 1.0.0
 */
final class AdminAppPage {

	/**
	 * Page key (one of `signatures` / `templates` / `settings`).
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
	 * Renders the page. Outputs the mount node, the bootstrap config
	 * blob, and the bundle `<script>` / `<link>` tags.
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

		$user_id = get_current_user_id();

		$config = [
			'page'         => $this->page,
			'userId'       => $user_id,
			'capabilities' => [
				'use'              => current_user_can( CapabilitiesInstaller::CAP_USE ),
				'manage_templates' => current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ),
				'manage_storage'   => current_user_can( CapabilitiesInstaller::CAP_MANAGE_STORAGE ),
			],
			'apiBase'      => esc_url_raw( rest_url( 'imagina-signatures/v1' ) ),
			'restNonce'    => wp_create_nonce( 'wp_rest' ),
			'locale'       => get_user_locale( $user_id ),
			'wpAdminUrl'   => esc_url_raw( admin_url() ),
			'urls'         => [
				'signatures' => esc_url_raw( admin_url( 'admin.php?page=' . AdminMenu::MENU_SLUG ) ),
				'templates'  => esc_url_raw( admin_url( 'admin.php?page=' . AdminMenu::TEMPLATES_SLUG ) ),
				'settings'   => esc_url_raw( admin_url( 'admin.php?page=' . AdminMenu::SETTINGS_SLUG ) ),
				'editor'     => esc_url_raw(
					admin_url( 'admin.php?page=' . AdminMenu::EDITOR_SLUG . '&id={id}' )
				),
			],
		];

		$admin_js    = esc_url( plugins_url( 'build/admin.js', IMGSIG_FILE ) );
		$admin_css   = esc_url( plugins_url( 'build/admin.css', IMGSIG_FILE ) );
		$config_json = (string) wp_json_encode( $config );

		// Hide wp-admin chrome so the React app can take over the
		// viewport. Same trick as the editor iframe page.
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
		<link rel="stylesheet" href="<?php echo esc_url( $admin_css ); ?>">
		<div id="imagina-admin-root"></div>
		<script>window.IMGSIG_ADMIN_CONFIG = <?php echo $config_json; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;</script>
		<script src="<?php echo esc_url( $admin_js ); ?>"></script>
		<?php
	}
}
