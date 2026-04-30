<?php
/**
 * Editor iframe controller.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Serves the HTML document the editor iframe loads.
 *
 * The wp-admin Editor page (in `Admin\Pages\EditorPage`) renders an
 * `<iframe>` whose `src` points at this endpoint. Because the request
 * is same-origin, WordPress's auth cookie travels with it
 * automatically; we additionally verify a short-lived token signed
 * with `wp_hash` so a leaked URL can't be replayed indefinitely.
 *
 * The response is a minimal HTML shell that bootstraps the React app
 * from `build/editor.js` plus a `<script>` tag that injects the
 * `IMGSIG_EDITOR_CONFIG` object (apiBase, restNonce, signatureId,
 * locale, ...) the app reads at startup. CSP is set so:
 *   - script-src is limited to 'self' + 'unsafe-inline' (the config
 *     blob is inline);
 *   - img-src includes data: and https: so user-uploaded images and
 *     pasted clipboard data work;
 *   - connect-src is 'self' so the editor can only call our REST API.
 *
 * @since 1.0.0
 */
final class EditorIframeController extends BaseController {

	/**
	 * Token TTL in seconds (1 hour, matches the editor session window).
	 */
	public const TOKEN_TTL = HOUR_IN_SECONDS;

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/editor/iframe',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'serve_iframe' ],
					'permission_callback' => '__return_true', // Token verification happens inside.
				],
			]
		);
	}

	/**
	 * Generates a tamper-proof iframe token for a (user, signature) pair.
	 *
	 * The token is `base64(json_payload).hash`, where the hash is
	 * `wp_hash($json_payload)` — verifying the hash on the way back
	 * proves the payload hasn't been tampered with.
	 *
	 * @since 1.0.0
	 *
	 * @param int $user_id      Owner.
	 * @param int $signature_id Signature being edited (0 for "new").
	 *
	 * @return string
	 */
	public static function mint_token( int $user_id, int $signature_id ): string {
		$payload = [
			'user_id'      => $user_id,
			'signature_id' => $signature_id,
			'expires'      => time() + self::TOKEN_TTL,
		];

		$json = (string) wp_json_encode( $payload );
		return rtrim( strtr( base64_encode( $json ), '+/', '-_' ), '=' ) . '.' . wp_hash( $json );
	}

	/**
	 * Verifies and decodes a previously-minted token.
	 *
	 * Returns the decoded payload on success or null on any failure
	 * (malformed, hash mismatch, expired) — callers should treat null
	 * as a hard "deny".
	 *
	 * @since 1.0.0
	 *
	 * @param string $token Raw token from the request.
	 *
	 * @return array{user_id: int, signature_id: int, expires: int}|null
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
		if ( ! is_array( $decoded ) ) {
			return null;
		}

		if ( ! isset( $decoded['user_id'], $decoded['signature_id'], $decoded['expires'] ) ) {
			return null;
		}

		if ( (int) $decoded['expires'] < time() ) {
			return null;
		}

		return [
			'user_id'      => (int) $decoded['user_id'],
			'signature_id' => (int) $decoded['signature_id'],
			'expires'      => (int) $decoded['expires'],
		];
	}

	/**
	 * Streams the iframe's HTML body and exits.
	 *
	 * Note: this method ALWAYS calls `exit` on its successful path —
	 * we control the entire response (HTML + custom headers) and
	 * don't want WordPress to append its own JSON envelope.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound request.
	 *
	 * @return void
	 */
	public function serve_iframe( \WP_REST_Request $request ): void {
		$token   = (string) $request->get_param( 'token' );
		$payload = self::verify_token( $token );

		if ( null === $payload ) {
			status_header( 403 );
			wp_die( esc_html__( 'Invalid or expired editor token.', 'imagina-signatures' ) );
		}

		// Re-establish current user context for the response: the
		// iframe is loaded same-origin so the auth cookie is already
		// in flight, but wp_set_current_user() makes the user
		// available to any code that runs in this request (e.g. the
		// preview-image proxy).
		wp_set_current_user( $payload['user_id'] );

		if ( ! current_user_can( CapabilitiesInstaller::CAP_USE ) ) {
			status_header( 403 );
			wp_die( esc_html__( 'You do not have permission to use the editor.', 'imagina-signatures' ) );
		}

		$config = [
			'signatureId' => $payload['signature_id'],
			'userId'      => $payload['user_id'],
			'apiBase'     => esc_url_raw( rest_url( self::NAMESPACE ) ),
			'restNonce'   => wp_create_nonce( 'wp_rest' ),
			'locale'      => get_user_locale( $payload['user_id'] ),
			'pluginUrl'   => esc_url_raw( plugins_url( '', IMGSIG_FILE ) ),
		];

		$editor_js   = esc_url( plugins_url( 'build/editor.js', IMGSIG_FILE ) );
		$editor_css  = esc_url( plugins_url( 'build/editor.css', IMGSIG_FILE ) );
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
		echo '<title>' . esc_html__( 'Imagina Signatures Editor', 'imagina-signatures' ) . '</title>' . "\n";
		echo '<link rel="stylesheet" href="' . $editor_css . '">' . "\n";
		echo '</head>' . "\n";
		echo '<body>' . "\n";
		echo '<div id="imagina-editor-root"></div>' . "\n";
		echo '<script>window.IMGSIG_EDITOR_CONFIG = ' . $config_json . ';</script>' . "\n";
		echo '<script type="module" src="' . $editor_js . '"></script>' . "\n";
		echo '</body>' . "\n";
		echo '</html>';
		// phpcs:enable WordPress.Security.EscapeOutput.OutputNotEscaped

		exit;
	}
}
