<?php
/**
 * Asset enqueuer for the React editor.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Loads `build/editor.js` + `build/editor.css` and injects the
 * `IMGSIG_EDITOR_CONFIG` bootstrap object on the editor page.
 *
 * The Vite bundle imports a shared chunk via ES modules, so the
 * script tag MUST carry `type="module"`. WordPress's enqueue API
 * doesn't have a native modifier for that — we filter
 * `script_loader_tag` to rewrite the tag for our handle.
 *
 * Loaded only on the editor page hook suffix that {@see AdminMenu}
 * registers — never globally.
 *
 * @since 1.0.6
 */
final class EditorAssetEnqueuer {

	private const HANDLE = 'imgsig-editor';

	/**
	 * Hook suffix WordPress assigned to the editor admin page.
	 *
	 * @var string
	 */
	private string $hook_suffix;

	/**
	 * @param string $hook_suffix Hook suffix for the editor page.
	 */
	public function __construct( string $hook_suffix ) {
		$this->hook_suffix = $hook_suffix;
	}

	/**
	 * Hooks into WordPress's asset pipeline.
	 *
	 * @since 1.0.6
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue' ] );
		add_filter( 'script_loader_tag', [ $this, 'tag_as_module' ], 10, 2 );
	}

	/**
	 * Enqueue the editor bundle when on the editor page.
	 *
	 * @since 1.0.6
	 *
	 * @param string $hook_suffix Current admin page hook suffix.
	 *
	 * @return void
	 */
	public function enqueue( string $hook_suffix ): void {
		if ( $hook_suffix !== $this->hook_suffix ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$signature_id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$version      = defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '1.0.0';

		// Hashed filenames from the Vite manifest — every release ships
		// fresh URLs so caches can't possibly serve a stale bundle.
		// Empty string means the manifest is missing or the entry is
		// not registered. ManifestReader has already queued an admin
		// notice; we refuse to emit a dead `<script>` URL here.
		$js_file  = ManifestReader::file_for( 'assets/editor/src/main.tsx' );
		$css_file = ManifestReader::css_for( 'assets/editor/src/main.tsx' );

		if ( '' === $js_file ) {
			return;
		}

		if ( '' !== $css_file ) {
			wp_enqueue_style(
				self::HANDLE,
				plugins_url( 'build/' . $css_file, IMGSIG_FILE ),
				[],
				$version
			);
		}

		wp_enqueue_script(
			self::HANDLE,
			plugins_url( 'build/' . $js_file, IMGSIG_FILE ),
			[],
			$version,
			true
		);

		wp_add_inline_script(
			self::HANDLE,
			'window.IMGSIG_EDITOR_CONFIG = ' . wp_json_encode( $this->build_config( $signature_id ) ) . ';',
			'before'
		);
	}

	/**
	 * Rewrites our script tag to `type="module"`.
	 *
	 * @since 1.0.6
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
		return str_replace( ' src=', ' type="module" src=', $tag );
	}

	/**
	 * Build the `IMGSIG_EDITOR_CONFIG` payload.
	 *
	 * @since 1.0.6
	 *
	 * @param int $signature_id 0 for "new", >0 for existing.
	 *
	 * @return array<string, mixed>
	 */
	private function build_config( int $signature_id ): array {
		$user_id   = get_current_user_id();
		$user      = wp_get_current_user();
		$site_opts = SiteSettingsController::current_settings();

		return [
			'pluginVersion'    => defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '0.0.0',
			'signatureId'      => $signature_id,
			'userId'           => $user_id,
			'apiBase'          => esc_url_raw( rest_url( 'imagina-signatures/v1' ) ),
			'restNonce'        => wp_create_nonce( 'wp_rest' ),
			'locale'           => get_user_locale( $user_id ),
			'pluginUrl'        => esc_url_raw( plugins_url( '', IMGSIG_FILE ) ),
			'signaturesUrl'    => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures' ) ),
			'capabilities'     => [
				'use'              => current_user_can( CapabilitiesInstaller::CAP_USE ),
				'manage_templates' => current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ),
			],
			'systemVariables'  => self::system_variables_for( $user ),
			'brandPalette'     => $site_opts['brand_palette'],
			'complianceFooter' => $site_opts['compliance_footer'],
			// Editor only sees CURRENTLY-ACTIVE campaigns (filtered by
			// enabled + date window) so the compile pipeline doesn't
			// have to know about scheduling. The admin sees the full
			// list via /admin/site-settings.
			'bannerCampaigns'  => SiteSettingsController::active_banner_campaigns(),
		];
	}

	/**
	 * Build the read-only `wp_*` variables that auto-populate from
	 * the WordPress user record. Plus a filterable extension hook so
	 * an admin (or another plugin) can expose custom user_meta keys.
	 *
	 * @since 1.0.13
	 *
	 * @param \WP_User $user The current user.
	 *
	 * @return array<string, string>
	 */
	private static function system_variables_for( \WP_User $user ): array {
		$base = [
			'wp_display_name' => (string) $user->display_name,
			'wp_email'        => (string) $user->user_email,
			'wp_first_name'   => (string) $user->first_name,
			'wp_last_name'    => (string) $user->last_name,
			'wp_url'          => (string) $user->user_url,
		];

		/**
		 * Filters the read-only system variables surfaced to the
		 * editor. Add `wp_user_meta` keys here, or expose org-wide
		 * defaults pulled from a directory sync.
		 *
		 * @since 1.0.13
		 *
		 * @param array<string, string> $base    Default `wp_*` variables.
		 * @param int                   $user_id The user the editor is bound to.
		 */
		$filtered = apply_filters( 'imgsig/editor/system_variables', $base, $user->ID );

		// Make sure the filter can't smuggle non-strings into the bag.
		$out = [];
		foreach ( (array) $filtered as $key => $value ) {
			if ( is_string( $key ) && ( is_string( $value ) || is_numeric( $value ) ) ) {
				$out[ $key ] = (string) $value;
			}
		}
		return $out;
	}
}
