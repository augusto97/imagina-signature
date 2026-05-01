<?php
/**
 * Asset enqueuer for the wp-admin React app.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Loads `build/admin.js` + `build/admin.css` and injects the
 * `IMGSIG_ADMIN_CONFIG` bootstrap object on our admin page hooks.
 *
 * The Vite bundle uses ES modules (`import` of a shared chunk), so
 * the script tag MUST carry `type="module"`. WordPress's enqueue API
 * does not have a native modifier for that — we filter
 * `script_loader_tag` to rewrite the tag for our handle.
 *
 * Only loads on the page hook suffixes registered by {@see AdminMenu}
 * — never on unrelated screens, never globally.
 *
 * @since 1.0.5
 */
final class AdminAssetEnqueuer {

	private const HANDLE = 'imgsig-admin';

	/**
	 * Map of WP page hook suffix => app `page` slug we boot into.
	 *
	 * @var array<string, string>
	 */
	private array $hook_pages;

	/**
	 * @param array<string, string> $hook_pages Hook suffix => app page slug map.
	 */
	public function __construct( array $hook_pages ) {
		$this->hook_pages = $hook_pages;
	}

	/**
	 * Hooks into WordPress's asset pipeline.
	 *
	 * @since 1.0.5
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue' ] );
		add_filter( 'script_loader_tag', [ $this, 'tag_as_module' ], 10, 2 );
	}

	/**
	 * Enqueue the admin bundle when on one of our pages.
	 *
	 * @since 1.0.5
	 *
	 * @param string $hook_suffix Current admin page hook suffix.
	 *
	 * @return void
	 */
	public function enqueue( string $hook_suffix ): void {
		if ( ! isset( $this->hook_pages[ $hook_suffix ] ) ) {
			return;
		}

		$page    = $this->hook_pages[ $hook_suffix ];
		$version = defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '1.0.0';

		wp_enqueue_style(
			self::HANDLE,
			plugins_url( 'build/admin.css', IMGSIG_FILE ),
			[],
			$version
		);

		wp_enqueue_script(
			self::HANDLE,
			plugins_url( 'build/admin.js', IMGSIG_FILE ),
			[],
			$version,
			true
		);

		// Attach the bootstrap config — `before` so it's defined when
		// the bundle's top-level code runs.
		wp_add_inline_script(
			self::HANDLE,
			'window.IMGSIG_ADMIN_CONFIG = ' . wp_json_encode( $this->build_config( $page ) ) . ';',
			'before'
		);
	}

	/**
	 * Rewrites our script tag to `type="module"` so Vite's ESM
	 * `import` of the shared chunk resolves at runtime.
	 *
	 * @since 1.0.5
	 *
	 * @param string $tag    Existing script tag HTML.
	 * @param string $handle WP script handle.
	 *
	 * @return string
	 */
	public function tag_as_module( string $tag, string $handle ): string {
		if ( self::HANDLE !== $handle ) {
			return $tag;
		}
		// `<script src="..."></script>` -> `<script type="module" src="..."></script>`.
		return str_replace( ' src=', ' type="module" src=', $tag );
	}

	/**
	 * Build the `IMGSIG_ADMIN_CONFIG` payload.
	 *
	 * @since 1.0.5
	 *
	 * @param string $page App page slug (`signatures`|`templates`|`settings`).
	 *
	 * @return array<string, mixed>
	 */
	private function build_config( string $page ): array {
		$user_id   = get_current_user_id();
		$site_opts = SiteSettingsController::current_settings();

		return [
			'page'             => $page,
			'userId'           => $user_id,
			'capabilities'     => [
				'use'              => current_user_can( CapabilitiesInstaller::CAP_USE ),
				'manage_templates' => current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ),
				'manage_storage'   => current_user_can( CapabilitiesInstaller::CAP_MANAGE_STORAGE ),
			],
			'apiBase'          => esc_url_raw( rest_url( 'imagina-signatures/v1' ) ),
			'restNonce'        => wp_create_nonce( 'wp_rest' ),
			'locale'           => get_user_locale( $user_id ),
			'wpAdminUrl'       => esc_url_raw( admin_url() ),
			'urls'             => [
				'signatures' => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures' ) ),
				'templates'  => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures-templates' ) ),
				'settings'   => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures-settings' ) ),
				'editor'     => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures-editor&id={id}' ) ),
			],
			'brandPalette'     => $site_opts['brand_palette'],
			'complianceFooter' => $site_opts['compliance_footer'],
			// Admin sees the FULL campaign list (enabled + disabled +
			// out-of-window) for editing. The editor bootstrap only
			// receives currently-active campaigns.
			'bannerCampaigns'  => $site_opts['banner_campaigns'],
		];
	}
}
