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
 * In-memory `$wpdb` double that understands the rate-limit store's
 * `INSERT … ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(IF(...))`
 * upsert (MySQL semantics: a fresh INSERT leaves insert_id at 0, a
 * duplicate-key update returns the expression through insert_id) and
 * the `SELECT hits` read-back. Records every query for assertions.
 */
class Imgsig_Fake_Wpdb extends wpdb { // phpcs:ignore

	/** @var array<string, array{w: int, h: int}> */
	public array $rows = [];

	/** @var array<int, string> */
	public array $queries = [];

	/** @var bool When true, query() fails like a missing table would. */
	public bool $fail = false;

	/** @var bool When true, insert_id is never populated (e.g. a DB translation layer). */
	public bool $no_last_insert_id = false;

	/** @var array<int, mixed> */
	private array $last_args = [];

	/**
	 * @param string $query   SQL.
	 * @param mixed  ...$args Args.
	 * @return string
	 */
	public function prepare( $query, ...$args ) {
		$this->last_args = $args;
		return (string) $query . ' -- ' . wp_json_encode_for_tests( $args );
	}

	/**
	 * @param string $query SQL.
	 * @return int|bool
	 */
	public function query( $query ) {
		$this->queries[] = (string) $query;
		if ( $this->fail ) {
			return false;
		}

		if ( false !== stripos( $query, 'ON DUPLICATE KEY UPDATE' ) ) {
			[ $key, $window ] = $this->last_args;
			if ( ! isset( $this->rows[ $key ] ) ) {
				$this->rows[ $key ] = [
					'w' => (int) $window,
					'h' => 1,
				];
				$this->insert_id    = 0;
				return 1;
			}
			$row                = $this->rows[ $key ];
			$hits               = $row['w'] === (int) $window ? $row['h'] + 1 : 1;
			$this->rows[ $key ] = [
				'w' => (int) $window,
				'h' => $hits,
			];
			$this->insert_id    = $this->no_last_insert_id ? 0 : $hits;
			return 2;
		}

		if ( 0 === stripos( ltrim( $query ), 'DELETE' ) ) {
			[ $before ] = $this->last_args;
			$deleted    = 0;
			foreach ( $this->rows as $key => $row ) {
				if ( $row['w'] < (int) $before ) {
					unset( $this->rows[ $key ] );
					++$deleted;
				}
			}
			return $deleted;
		}

		return 0;
	}

	/**
	 * @param string|null $query SQL.
	 * @return mixed
	 */
	public function get_var( $query = null ) {
		$this->queries[] = (string) $query;
		if ( false !== stripos( (string) $query, 'SELECT hits' ) ) {
			$key = $this->last_args[0];
			return isset( $this->rows[ $key ] ) ? (string) $this->rows[ $key ]['h'] : null;
		}
		return null;
	}
}

/**
 * json_encode wrapper used by the fake $wpdb (avoids depending on a
 * Brain Monkey stub for wp_json_encode inside test plumbing).
 *
 * @param mixed $value Value.
 */
function wp_json_encode_for_tests( $value ): string {
	return (string) json_encode( $value );
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
