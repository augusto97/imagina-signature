<?php
/**
 * WordPress stand-ins shared by the brand-kit tests.
 *
 * @package ImaginaSignatures\Tests\Unit\Settings
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Settings;

use Brain\Monkey\Functions;

require_once __DIR__ . '/../../fixtures/wp-user-stub.php';

/**
 * Close-enough doubles of the core sanitisers the brand kit relies on.
 * Must run after `Brain\Monkey\setUp()`.
 */
trait BrandKitStubs {

	/**
	 * Stubs `sanitize_text_field`, `sanitize_email`, `esc_url_raw` and
	 * `wp_parse_url` with behaviour that mirrors core for the inputs
	 * the tests use.
	 */
	private function stub_sanitizers(): void {
		Functions\when( 'sanitize_text_field' )->alias(
			static function ( $value ): string {
				$value = (string) preg_replace( '@<(script|style)[^>]*?>.*?</\\1>@si', '', (string) $value );
				$value = strip_tags( $value );
				return trim( (string) preg_replace( '/[\r\n\t ]+/', ' ', $value ) );
			}
		);
		Functions\when( 'sanitize_email' )->alias(
			static function ( $value ): string {
				$value = trim( (string) $value );
				return false !== filter_var( $value, FILTER_VALIDATE_EMAIL ) ? $value : '';
			}
		);
		// Mirrors esc_url(): strips disallowed characters, prepends
		// http:// to scheme-less values, and returns '' when the scheme
		// is not in $protocols (wp_kses_bad_protocol changed the URL).
		Functions\when( 'esc_url_raw' )->alias(
			static function ( $url, $protocols = null ): string {
				$url = str_replace( ' ', '%20', ltrim( (string) $url ) );
				$url = (string) preg_replace( '|[^a-z0-9-~+_.?#=!&;,/:%@$\|*\'()\[\]\\x80-\\xff]|i', '', $url );
				if ( '' === $url ) {
					return '';
				}
				if ( false === strpos( $url, ':' ) && ! in_array( $url[0], [ '/', '#', '?' ], true ) ) {
					$url = 'http://' . $url;
				}
				if ( '/' === $url[0] ) {
					return $url;
				}
				$allowed = is_array( $protocols ) ? $protocols : [ 'http', 'https', 'mailto', 'tel' ];
				if ( ! preg_match( '/^([a-z][a-z0-9+.\-]*):/i', $url, $m ) || ! in_array( strtolower( $m[1] ), $allowed, true ) ) {
					return '';
				}
				return $url;
			}
		);
		Functions\when( 'wp_parse_url' )->alias(
			static function ( $url, $component = -1 ) {
				return parse_url( (string) $url, $component ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url
			}
		);
	}
}
