<?php
/**
 * Asset enqueuer for the wp-admin React app.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Core\I18n;
use ImaginaSignatures\Core\ScriptTags;
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

		// Resolve the hashed filenames Vite emits. Empty string means
		// the manifest is missing (`build/.vite/manifest.json` not
		// shipped) or the entry isn't registered. ManifestReader has
		// already queued an admin notice; we refuse to emit a dead
		// script tag here. The legacy fallback ('admin.js') was
		// removed in 1.0.25 — Vite always emits hashed filenames so
		// the fallback URL would 404.
		$js_file  = ManifestReader::file_for( 'assets/admin/src/main.tsx' );
		$css_file = ManifestReader::css_for( 'assets/admin/src/main.tsx' );

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
		// Idempotent: several enqueuer instances (AdminMenu, DirectoryPages)
		// each add this filter for the same handle.
		if ( self::HANDLE !== $handle ) {
			return $tag;
		}
		if ( false === strpos( $tag, 'type="module"' ) ) {
			// `<script src="..."></script>` -> `<script type="module" src="..."></script>`.
			$tag = str_replace( ' src=', ' type="module" src=', $tag );
		}
		// The tag includes the inline `IMGSIG_ADMIN_CONFIG` bootstrap:
		// keep both away from Rocket Loader so they run, in order.
		return ScriptTags::opt_out_of_optimizers( $tag );
	}

	/**
	 * Build the `IMGSIG_ADMIN_CONFIG` payload.
	 *
	 * @since 1.0.5
	 *
	 * @param string $page App page slug (`signatures`|`templates`|`settings`|`profile`|`groups`|`team`).
	 *
	 * @return array<string, mixed>
	 */
	private function build_config( string $page ): array {
		$user_id   = get_current_user_id();
		$site_opts = SiteSettingsController::current_settings();

		return [
			'pluginVersion'    => defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '0.0.0',
			'page'             => $page,
			'userId'           => $user_id,
			'capabilities'     => [
				'use'              => current_user_can( CapabilitiesInstaller::CAP_USE ),
				'manage_templates' => current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ),
				'manage_storage'   => current_user_can( CapabilitiesInstaller::CAP_MANAGE_STORAGE ),
				'manage_team'      => current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEAM ),
			],
			'apiBase'          => esc_url_raw( rest_url( 'imagina-signatures/v1' ) ),
			'restNonce'        => wp_create_nonce( 'wp_rest' ),
			// For refreshing an expired REST nonce via core's
			// `admin-ajax.php?action=rest-nonce`.
			'ajaxUrl'          => esc_url_raw( admin_url( 'admin-ajax.php' ) ),
			'locale'           => get_user_locale( $user_id ),
			// `{ msgid: msgstr }` for the user's locale ({} for English).
			'translations'     => I18n::js_translations( get_user_locale( $user_id ) ),
			'wpAdminUrl'       => esc_url_raw( admin_url() ),
			'urls'             => [
				'signatures' => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures' ) ),
				'templates'  => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures-templates' ) ),
				'settings'   => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures-settings' ) ),
				// Use `__ID__` (alphanumeric, no special chars) as the
				// placeholder so `esc_url_raw` doesn't strip it. The
				// previous `{id}` template lost its braces because
				// `esc_url_raw` URL-encodes / drops them depending on
				// the WP build, leaving the literal string "id" as the
				// id parameter — every "Edit" link in the listing
				// opened the editor with `?id=id` instead of the row's
				// real id.
				'editor'     => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures-editor&id=__ID__' ) ),
				'profile'    => DirectoryPages::profile_url(),
				'groups'     => DirectoryPages::groups_url(),
				'team'       => DirectoryPages::team_url(),
			],
			'brandPalette'     => $site_opts['brand_palette'],
			'complianceFooter' => $site_opts['compliance_footer'],
			// 1.2.0: the Brand kit tab hides its logo "Upload" button in
			// URL-only storage mode (same flag as the editor's).
			'uploadEnabled'    => 'url_only' !== (string) get_option( 'imgsig_storage_driver', 'media_library' ),
			// Admin sees the FULL campaign list (enabled + disabled +
			// out-of-window) for editing. The editor bootstrap only
			// receives currently-active campaigns.
			'bannerCampaigns'  => $site_opts['banner_campaigns'],
		];
	}
}
