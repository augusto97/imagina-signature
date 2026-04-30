<?php
/**
 * Admin app iframe controller.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Serves the bare HTML the wp-admin pages mount via an iframe.
 *
 * The wp-admin chrome and WordPress's own forms.css / common.css
 * apply default styles to native form controls — buttons, inputs,
 * tables — that fight with our React admin UI. Putting the React
 * app inside an iframe served from this endpoint sidesteps that
 * entirely: the iframe document has only our CSS, and wp-admin
 * doesn't get a chance to repaint our buttons.
 *
 * Same trick as {@see EditorIframeController}, with a different
 * payload (the React admin entry instead of the editor entry) and
 * a `page` field on the token so the React app knows whether the
 * user opened Signatures, Templates, or Settings.
 *
 * @since 1.0.3
 */
final class AdminAppController extends BaseController {

	/**
	 * Token TTL in seconds.
	 */
	public const TOKEN_TTL = HOUR_IN_SECONDS;

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/admin/app',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'serve' ],
					'permission_callback' => '__return_true', // Token verification happens inside.
				],
			]
		);
	}

	/**
	 * Generates a tamper-proof iframe token for an admin page load.
	 *
	 * @since 1.0.3
	 *
	 * @param int    $user_id Caller's user ID.
	 * @param string $page    `signatures` | `templates` | `settings`.
	 *
	 * @return string
	 */
	public static function mint_token( int $user_id, string $page ): string {
		$payload = [
			'user_id' => $user_id,
			'page'    => $page,
			'expires' => time() + self::TOKEN_TTL,
		];

		$json = (string) wp_json_encode( $payload );
		return rtrim( strtr( base64_encode( $json ), '+/', '-_' ), '=' ) . '.' . wp_hash( $json );
	}

	/**
	 * Verifies and decodes a token; returns null on any failure.
	 *
	 * @since 1.0.3
	 *
	 * @param string $token Raw token.
	 *
	 * @return array{user_id: int, page: string, expires: int}|null
	 */
	public static function verify_token( string $token ): ?array {
		$parts = explode( '.', $token, 2 );
		if ( 2 !== count( $parts ) ) {
			return null;
		}

		$json = base64_decode( strtr( $parts[0], '-_', '+/' ), true );
		if ( false === $json ) {
			return null;
		}

		if ( ! hash_equals( wp_hash( $json ), $parts[1] ) ) {
			return null;
		}

		$decoded = json_decode( $json, true );
		if ( ! is_array( $decoded ) || ! isset( $decoded['user_id'], $decoded['page'], $decoded['expires'] ) ) {
			return null;
		}

		if ( (int) $decoded['expires'] < time() ) {
			return null;
		}

		return [
			'user_id' => (int) $decoded['user_id'],
			'page'    => (string) $decoded['page'],
			'expires' => (int) $decoded['expires'],
		];
	}

	/**
	 * Streams the iframe document and exits.
	 *
	 * @since 1.0.3
	 *
	 * @param \WP_REST_Request $request Inbound request.
	 *
	 * @return void
	 */
	public function serve( \WP_REST_Request $request ): void {
		$token   = (string) $request->get_param( 'token' );
		$payload = self::verify_token( $token );

		if ( null === $payload ) {
			status_header( 403 );
			wp_die( esc_html__( 'Invalid or expired admin token.', 'imagina-signatures' ) );
		}

		wp_set_current_user( $payload['user_id'] );

		// The required cap depends on the page the iframe is being
		// loaded for. Settings is admin-only; Signatures / Templates
		// just need imgsig_use_signatures.
		$required_cap = 'settings' === $payload['page']
			? CapabilitiesInstaller::CAP_MANAGE_STORAGE
			: CapabilitiesInstaller::CAP_USE;

		if ( ! current_user_can( $required_cap ) ) {
			status_header( 403 );
			wp_die( esc_html__( 'You do not have permission to view this page.', 'imagina-signatures' ) );
		}

		$user_id = $payload['user_id'];
		$page    = $payload['page'];

		$config = [
			'page'         => $page,
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
				'signatures' => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures' ) ),
				'templates'  => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures-templates' ) ),
				'settings'   => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures-settings' ) ),
				'editor'     => esc_url_raw( admin_url( 'admin.php?page=imagina-signatures-editor&id={id}' ) ),
			],
		];

		$admin_js    = esc_url( plugins_url( 'build/admin.js', IMGSIG_FILE ) );
		$admin_css   = esc_url( plugins_url( 'build/admin.css', IMGSIG_FILE ) );
		$config_json = (string) wp_json_encode( $config );

		header( 'Content-Type: text/html; charset=utf-8' );
		header( 'X-Frame-Options: SAMEORIGIN' );
		header(
			"Content-Security-Policy: default-src 'self'; "
			. "img-src 'self' data: https:; "
			. "style-src 'self' 'unsafe-inline'; "
			. "script-src 'self' 'unsafe-inline'; "
			. "font-src 'self' data:; "
			. "connect-src 'self';"
		);
		header( 'X-Content-Type-Options: nosniff' );

		// phpcs:disable WordPress.Security.EscapeOutput.OutputNotEscaped
		echo '<!DOCTYPE html>' . "\n";
		echo '<html lang="' . esc_attr( get_locale() ) . '">' . "\n";
		echo '<head>' . "\n";
		echo '<meta charset="utf-8">' . "\n";
		echo '<meta name="viewport" content="width=device-width, initial-scale=1">' . "\n";
		echo '<title>' . esc_html__( 'Imagina Signatures', 'imagina-signatures' ) . '</title>' . "\n";
		echo '<link rel="stylesheet" href="' . $admin_css . '">' . "\n";
		echo '</head>' . "\n";
		echo '<body>' . "\n";
		echo '<div id="imagina-admin-root"></div>' . "\n";
		echo '<script>window.IMGSIG_ADMIN_CONFIG = ' . $config_json . ';</script>' . "\n";
		echo '<script type="module" src="' . $admin_js . '"></script>' . "\n";
		echo '</body>' . "\n";
		echo '</html>';
		// phpcs:enable WordPress.Security.EscapeOutput.OutputNotEscaped

		exit;
	}
}
