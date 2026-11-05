<?php
/**
 * Shared PHPUnit helpers.
 *
 * @package ImaginaSignatures\Tests
 */

declare(strict_types=1);

// PHP 8 string helpers used by the WordPress kses fixture — polyfilled
// so the XSS tests also run on the PHP 7.4 CI leg (WordPress itself
// ships these in wp-includes/compat.php).
if ( ! function_exists( 'str_contains' ) ) {
	/**
	 * @param string $haystack Haystack.
	 * @param string $needle   Needle.
	 */
	function str_contains( string $haystack, string $needle ): bool {
		return '' === $needle || false !== strpos( $haystack, $needle );
	}
}
if ( ! function_exists( 'str_starts_with' ) ) {
	/**
	 * @param string $haystack Haystack.
	 * @param string $needle   Needle.
	 */
	function str_starts_with( string $haystack, string $needle ): bool {
		return 0 === strncmp( $haystack, $needle, strlen( $needle ) );
	}
}
if ( ! function_exists( 'str_ends_with' ) ) {
	/**
	 * @param string $haystack Haystack.
	 * @param string $needle   Needle.
	 */
	function str_ends_with( string $haystack, string $needle ): bool {
		return '' === $needle || ( strlen( $needle ) <= strlen( $haystack ) && 0 === substr_compare( $haystack, $needle, -strlen( $needle ) ) );
	}
}

/**
 * Loads WordPress' real kses implementation (test fixture) and stubs
 * the handful of core helpers it — and HtmlSanitizer — call.
 *
 * Must run AFTER `Brain\Monkey\setUp()` in each test that needs it.
 *
 * @return void
 */
function imgsig_tests_load_kses(): void {
	require_once __DIR__ . '/fixtures/wordpress/kses.php';

	\Brain\Monkey\Functions\when( 'wp_allowed_protocols' )->justReturn(
		[ 'http', 'https', 'ftp', 'ftps', 'mailto', 'news', 'irc', 'irc6', 'ircs', 'gopher', 'nntp', 'feed', 'telnet', 'mms', 'rtsp', 'sms', 'svn', 'tel', 'fax', 'xmpp', 'webcal', 'urn' ]
	);
	\Brain\Monkey\Functions\when( 'esc_attr' )->alias(
		static function ( $text ): string {
			return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
		}
	);
	\Brain\Monkey\Functions\when( 'wp_strip_all_tags' )->alias(
		static function ( $text, $remove_breaks = false ): string {
			$text = (string) preg_replace( '@<(script|style)[^>]*?>.*?</\\1>@si', '', (string) $text );
			$text = strip_tags( $text );
			if ( $remove_breaks ) {
				$text = (string) preg_replace( '/[\r\n\t ]+/', ' ', $text );
			}
			return trim( $text );
		}
	);
}
