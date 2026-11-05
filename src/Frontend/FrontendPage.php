<?php
/**
 * Public-facing page renderer.
 *
 * @package ImaginaSignatures\Frontend
 */

declare(strict_types=1);

namespace ImaginaSignatures\Frontend;

use ImaginaSignatures\Admin\ManifestReader;
use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Renders the standalone HTML page that hosts the React apps on
 * the public-facing route.
 *
 * Two views (chosen by the router):
 *
 *  - `index`   — mounts the admin bundle in `signatures` mode, so
 *                the user sees the same dashboard the wp-admin path
 *                shows, just on a public URL with `urls.*` pointing
 *                back to the public routes.
 *  - `editor`  — mounts the editor bundle with `signatureId={id}`,
 *                identical to the wp-admin editor but with `signaturesUrl`
 *                pointing to the public dashboard so the back-arrow
 *                takes the user back to `/<slug>/`, not wp-admin.
 *
 * Both views check that the user is logged in AND holds `imgsig_use_signatures`.
 * A logged-out user sees a centered login CTA that redirects back to
 * the URL they tried; a logged-in user without the cap sees a 403
 * page explaining the reason.
 *
 * @since 1.0.24
 */
final class FrontendPage {

	/**
	 * Entry point. Picks the view, runs the auth checks, dispatches
	 * to the matching render method.
	 *
	 * @since 1.0.24
	 *
	 * @param string $view         `index` | `editor`.
	 * @param int    $signature_id 0 for "new" on the editor view.
	 *
	 * @return void
	 */
	public function render( string $view, int $signature_id ): void {
		nocache_headers();

		if ( ! is_user_logged_in() ) {
			$this->render_login_prompt( $view, $signature_id );
			return;
		}

		if ( ! current_user_can( CapabilitiesInstaller::CAP_USE ) ) {
			$this->render_forbidden();
			return;
		}

		if ( 'editor' === $view ) {
			$this->render_editor( $signature_id );
			return;
		}

		$this->render_index();
	}

	/**
	 * Renders the public signature listing — same bundle as the
	 * wp-admin "My Signatures" page.
	 *
	 * @since 1.0.24
	 *
	 * @return void
	 */
	private function render_index(): void {
		$config = $this->build_admin_config( 'signatures' );
		$this->render_shell(
			__( 'My Signatures', 'imagina-signatures' ),
			'imagina-admin-root',
			'IMGSIG_ADMIN_CONFIG',
			$config,
			'assets/admin/src/main.tsx',
			'admin.js'
		);
	}

	/**
	 * Renders the public editor — same bundle as the wp-admin editor
	 * page, with the ownership check ported over so users can't open
	 * other users' signatures by guessing the id.
	 *
	 * @since 1.0.24
	 *
	 * @param int $signature_id 0 for "new", >0 for existing.
	 *
	 * @return void
	 */
	private function render_editor( int $signature_id ): void {
		if ( $signature_id > 0 ) {
			$repo      = new SignatureRepository( $GLOBALS['wpdb'] );
			$signature = $repo->find_owned_by( $signature_id, get_current_user_id() );
			if ( null === $signature ) {
				$this->render_forbidden();
				return;
			}
		}

		$config = $this->build_editor_config( $signature_id );
		$this->render_shell(
			__( 'Signature Editor', 'imagina-signatures' ),
			'imagina-editor-root',
			'IMGSIG_EDITOR_CONFIG',
			$config,
			'assets/editor/src/main.tsx',
			'editor.js'
		);
	}

	/**
	 * Common HTML shell. Outputs a complete `<!DOCTYPE html>` document
	 * with the stylesheet, mount point, and bootstrap config — then
	 * loads the bundle as a module. No theme, no wp-admin chrome.
	 *
	 * Responsible for the security-relevant response headers (CSP,
	 * X-Frame-Options, Referrer-Policy) because the route bypasses
	 * WordPress's normal template chain — anything we don't set here
	 * doesn't get set at all.
	 *
	 * @since 1.0.24
	 *
	 * @param string               $title         Page title.
	 * @param string               $mount_id      DOM id for the React root.
	 * @param string               $config_global Window-level config variable name.
	 * @param array<string, mixed> $config        Bootstrap payload.
	 * @param string               $manifest_key  Vite manifest entry path.
	 * @param string               $fallback_file Bundle filename if manifest missing.
	 *
	 * @return void
	 */
	private function render_shell(
		string $title,
		string $mount_id,
		string $config_global,
		array $config,
		string $manifest_key,
		string $fallback_file
	): void {
		$js_file  = ManifestReader::file_for( $manifest_key, $fallback_file );
		$css_file = ManifestReader::css_for( $manifest_key );

		$js_url  = plugins_url( 'build/' . $js_file, IMGSIG_FILE );
		$css_url = '' !== $css_file ? plugins_url( 'build/' . $css_file, IMGSIG_FILE ) : '';

		// CSP mirrors the wp-admin editor page: same-origin scripts +
		// inline (Vite hashed names + our bootstrap), permissive image
		// sources for user-uploaded content, REST endpoint on same
		// origin. `frame-ancestors 'self'` keeps this page un-embeddable
		// by other origins.
		header( 'Content-Type: text/html; charset=' . get_bloginfo( 'charset' ) );
		header( 'X-Frame-Options: SAMEORIGIN' );
		header( 'Referrer-Policy: strict-origin-when-cross-origin' );
		header( "Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'self';" );

		// phpcs:disable WordPress.Security.EscapeOutput.OutputNotEscaped
		?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title><?php echo esc_html( $title ); ?></title>
		<?php if ( '' !== $css_url ) : ?>
<link rel="stylesheet" href="<?php echo esc_url( $css_url ); ?>" />
		<?php endif; ?>
<style>
html, body { margin: 0; padding: 0; background: #f7f8fa; min-height: 100vh; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
</style>
</head>
<body>
<div id="<?php echo esc_attr( $mount_id ); ?>"></div>
<script>window.<?php echo $config_global; ?> = <?php echo wp_json_encode( $config ); ?>;</script>
<script type="module" src="<?php echo esc_url( $js_url ); ?>"></script>
</body>
</html>
		<?php
		// phpcs:enable WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Logged-out fallback. Renders a minimal centered card with the
	 * site name + a primary "Log in" button that redirects back to
	 * the URL the user was trying to reach.
	 *
	 * The return URL is rebuilt from the router's parsed view + id
	 * on top of `home_url()` — never from the raw `Host` header or
	 * `REQUEST_URI`, which an attacker controls (host-header
	 * injection would otherwise let them mint login links that bounce
	 * victims to a foreign domain after authentication).
	 *
	 * @since 1.0.24
	 *
	 * @param string $view         `index` | `editor`.
	 * @param int    $signature_id Signature id for the editor view (0 = new).
	 *
	 * @return void
	 */
	private function render_login_prompt( string $view = 'index', int $signature_id = 0 ): void {
		$return_url = self::return_url_for( $view, $signature_id );
		$login_url  = wp_login_url( $return_url );

		status_header( 401 );
		header( 'Content-Type: text/html; charset=' . get_bloginfo( 'charset' ) );
		nocache_headers();

		// phpcs:disable WordPress.Security.EscapeOutput.OutputNotEscaped
		?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title><?php echo esc_html__( 'Log in to access your signatures', 'imagina-signatures' ); ?></title>
<style>
html, body { margin:0; padding:0; height:100%; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f7f8fa; color:#111827; }
.box { max-width:380px; margin:80px auto; padding:32px; background:#fff; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.05); text-align:center; }
.box h1 { margin:0 0 8px 0; font-size:18px; }
.box p { margin:0 0 20px 0; color:#6b7280; font-size:14px; line-height:1.5; }
.btn { display:inline-block; padding:10px 18px; background:#3b82f6; color:#fff; text-decoration:none; font-weight:600; border-radius:6px; font-size:14px; }
.btn:hover { background:#2563eb; }
</style>
</head>
<body>
<div class="box">
<h1><?php echo esc_html__( 'You need to log in', 'imagina-signatures' ); ?></h1>
<p><?php echo esc_html__( 'Sign in to your account to manage your email signatures.', 'imagina-signatures' ); ?></p>
<a class="btn" href="<?php echo esc_url( $login_url ); ?>"><?php echo esc_html__( 'Log in', 'imagina-signatures' ); ?></a>
</div>
</body>
</html>
		<?php
		// phpcs:enable WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Builds the post-login redirect target for a public-route view.
	 *
	 * @since 1.0.40
	 *
	 * @param string $view         `index` | `editor`.
	 * @param int    $signature_id Signature id for the editor view (0 = new).
	 *
	 * @return string Absolute URL on this site's home origin.
	 */
	public static function return_url_for( string $view, int $signature_id ): string {
		if ( 'editor' === $view ) {
			$url = $signature_id > 0
				? FrontendAccess::editor_url( $signature_id )
				: esc_url_raw( home_url( '/' . FrontendAccess::slug() . '/editor/' ) );
		} else {
			$url = FrontendAccess::dashboard_url();
		}

		// Belt and braces: never hand wp_login_url() anything that
		// isn't on an allowed redirect host.
		return wp_validate_redirect( $url, home_url( '/' ) );
	}

	/**
	 * Forbidden fallback — logged in but missing the cap.
	 *
	 * @since 1.0.24
	 *
	 * @return void
	 */
	private function render_forbidden(): void {
		status_header( 403 );
		header( 'Content-Type: text/html; charset=' . get_bloginfo( 'charset' ) );
		nocache_headers();

		// phpcs:disable WordPress.Security.EscapeOutput.OutputNotEscaped
		?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title><?php echo esc_html__( 'Access denied', 'imagina-signatures' ); ?></title>
<style>
html, body { margin:0; padding:0; height:100%; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f7f8fa; color:#111827; }
.box { max-width:380px; margin:80px auto; padding:32px; background:#fff; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.05); text-align:center; }
.box h1 { margin:0 0 8px 0; font-size:18px; }
.box p { margin:0; color:#6b7280; font-size:14px; line-height:1.5; }
</style>
</head>
<body>
<div class="box">
<h1><?php echo esc_html__( 'Access denied', 'imagina-signatures' ); ?></h1>
<p><?php echo esc_html__( 'Your account does not have permission to use Imagina Signatures. Ask a site administrator to grant access.', 'imagina-signatures' ); ?></p>
</div>
</body>
</html>
		<?php
		// phpcs:enable WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Builds the admin bundle's bootstrap config, with URLs pointing
	 * at the public dashboard (not wp-admin). Mirrors the shape that
	 * `AdminAssetEnqueuer::build_config()` produces so the React app
	 * sees an identical contract whichever route mounted it.
	 *
	 * @since 1.0.24
	 *
	 * @param string $page React app `page` discriminator.
	 *
	 * @return array<string, mixed>
	 */
	private function build_admin_config( string $page ): array {
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
			],
			'apiBase'          => esc_url_raw( rest_url( 'imagina-signatures/v1' ) ),
			'restNonce'        => wp_create_nonce( 'wp_rest' ),
			'locale'           => get_user_locale( $user_id ),
			// Subscribers don't have wp-admin access — the sidebar's
			// "back" link uses this as its destination, so point it at
			// the WP site home. The SidebarNav reads `frontendContext`
			// and swaps its label from "Back to WP Admin" to "Back to
			// home" when this URL is in play.
			'wpAdminUrl'       => esc_url_raw( home_url( '/' ) ),
			'urls'             => [
				'signatures' => FrontendAccess::dashboard_url(),
				// Subscribers don't get manage_templates / manage_storage,
				// so the React app hides those tabs. The URLs still need
				// to exist for the type contract — point them at the
				// dashboard.
				'templates'  => FrontendAccess::dashboard_url(),
				'settings'   => FrontendAccess::dashboard_url(),
				// `__ID__` (not `{id}`) because the admin React app's
				// URL templates use the alphanumeric convention
				// introduced in 1.0.27 — braces lost their escaping
				// through `esc_url_raw` and broke every Edit link.
				'editor'     => FrontendAccess::editor_url( '__ID__' ),
			],
			'frontendContext'  => 'public',
			'brandPalette'     => $site_opts['brand_palette'],
			'complianceFooter' => $site_opts['compliance_footer'],
			'bannerCampaigns'  => $site_opts['banner_campaigns'],
		];
	}

	/**
	 * Builds the editor bundle's bootstrap config. Identical shape to
	 * `EditorAssetEnqueuer::build_config()` with two differences:
	 *
	 *   - `signaturesUrl` points to the public dashboard so the back
	 *     arrow takes the user home, not to wp-admin.
	 *   - `frontendContext` tag added so the React side could (in the
	 *     future) hide affordances that only make sense in wp-admin.
	 *
	 * @since 1.0.24
	 *
	 * @param int $signature_id 0 for "new", >0 for existing.
	 *
	 * @return array<string, mixed>
	 */
	private function build_editor_config( int $signature_id ): array {
		$user_id   = get_current_user_id();
		$user      = wp_get_current_user();
		$site_opts = SiteSettingsController::current_settings();

		// Mirrors EditorAssetEnqueuer: when the active storage driver
		// is `url_only` we hide the upload UI in image / avatar / banner
		// blocks so the editor can't dangle an upload button against a
		// driver that refuses writes.
		$active_driver  = (string) get_option( 'imgsig_storage_driver', 'media_library' );
		$upload_enabled = 'url_only' !== $active_driver;

		return [
			'pluginVersion'    => defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '0.0.0',
			'signatureId'      => $signature_id,
			'userId'           => $user_id,
			'apiBase'          => esc_url_raw( rest_url( 'imagina-signatures/v1' ) ),
			'restNonce'        => wp_create_nonce( 'wp_rest' ),
			'locale'           => get_user_locale( $user_id ),
			'pluginUrl'        => esc_url_raw( plugins_url( '', IMGSIG_FILE ) ),
			'signaturesUrl'    => FrontendAccess::dashboard_url(),
			'capabilities'     => [
				'use'              => current_user_can( CapabilitiesInstaller::CAP_USE ),
				'manage_templates' => current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ),
			],
			'uploadEnabled'    => $upload_enabled,
			'systemVariables'  => self::system_variables_for( $user ),
			'frontendContext'  => 'public',
			'brandPalette'     => $site_opts['brand_palette'],
			'complianceFooter' => $site_opts['compliance_footer'],
			'bannerCampaigns'  => SiteSettingsController::active_banner_campaigns(),
		];
	}

	/**
	 * Same shape as `EditorAssetEnqueuer::system_variables_for()`.
	 * Duplicated rather than imported because the asset enqueuer is
	 * admin-only and we don't want to load that namespace on the
	 * public route. If a third variant appears we'll lift this into
	 * a shared service.
	 *
	 * @since 1.0.24
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

		/** @see \ImaginaSignatures\Admin\EditorAssetEnqueuer for filter docs. */
		$filtered = apply_filters( 'imgsig/editor/system_variables', $base, $user->ID );

		$out = [];
		foreach ( (array) $filtered as $key => $value ) {
			if ( is_string( $key ) && ( is_string( $value ) || is_numeric( $value ) ) ) {
				$out[ $key ] = (string) $value;
			}
		}
		return $out;
	}
}
