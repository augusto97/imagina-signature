<?php
/**
 * PHPUnit bootstrap.
 *
 * Loads the plugin autoloader so unit tests can use the production classes
 * without depending on a full WordPress test environment. Stubs the small
 * subset of WP functions our `src/` code references so tests don't need a
 * full WP install.
 *
 * @package ImaginaSignatures\Tests
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

if ( ! defined( 'IMGSIG_PLUGIN_DIR' ) ) {
	define( 'IMGSIG_PLUGIN_DIR', dirname( __DIR__, 2 ) . '/' );
}

if ( ! defined( 'IMGSIG_VERSION' ) ) {
	define( 'IMGSIG_VERSION', '1.0.0' );
}

if ( ! defined( 'IMGSIG_PLUGIN_BASENAME' ) ) {
	define( 'IMGSIG_PLUGIN_BASENAME', 'imagina-signatures/imagina-signatures.php' );
}

if ( ! defined( 'IMGSIG_MIN_PHP' ) ) {
	define( 'IMGSIG_MIN_PHP', '7.4' );
}

if ( ! defined( 'IMGSIG_MIN_WP' ) ) {
	define( 'IMGSIG_MIN_WP', '6.0' );
}

if ( ! defined( 'AUTH_KEY' ) ) {
	define( 'AUTH_KEY', 'imagina-signatures-tests-static-auth-key' );
}

if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
	define( 'MINUTE_IN_SECONDS', 60 );
}
if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
	define( 'HOUR_IN_SECONDS', 60 * 60 );
}

if ( ! defined( 'OPENSSL_RAW_DATA' ) ) {
	define( 'OPENSSL_RAW_DATA', 1 );
}

require_once dirname( __DIR__, 2 ) . '/src/Core/Autoloader.php';
\ImaginaSignatures\Core\Autoloader::register();

$composer_autoload = dirname( __DIR__, 2 ) . '/vendor/autoload.php';
if ( file_exists( $composer_autoload ) ) {
	require_once $composer_autoload;
}

// In-memory option store so tests don't need a real DB.
$GLOBALS['imgsig_test_options']    = [];
$GLOBALS['imgsig_test_transients'] = [];

if ( ! function_exists( 'wp_json_encode' ) ) {
	function wp_json_encode( $value, $options = 0, $depth = 512 ) {
		return json_encode( $value, $options, $depth );
	}
}

if ( ! function_exists( 'wp_parse_url' ) ) {
	function wp_parse_url( $url, $component = -1 ) {
		return parse_url( $url, $component );
	}
}

if ( ! function_exists( 'esc_url_raw' ) ) {
	function esc_url_raw( $url ) {
		return $url;
	}
}

if ( ! function_exists( 'sanitize_text_field' ) ) {
	function sanitize_text_field( $str ) {
		$str = is_string( $str ) ? $str : '';
		return trim( strip_tags( $str ) );
	}
}

if ( ! function_exists( 'sanitize_key' ) ) {
	function sanitize_key( $key ) {
		$key = is_string( $key ) ? strtolower( $key ) : '';
		return preg_replace( '/[^a-z0-9_\-]/', '', $key );
	}
}

if ( ! function_exists( '__' ) ) {
	function __( $text, $domain = '' ) {
		return $text;
	}
}

if ( ! function_exists( '_n' ) ) {
	function _n( $single, $plural, $n, $domain = '' ) {
		return 1 === (int) $n ? $single : $plural;
	}
}

if ( ! function_exists( 'esc_html__' ) ) {
	function esc_html__( $text, $domain = '' ) {
		return $text;
	}
}

if ( ! function_exists( 'apply_filters' ) ) {
	function apply_filters( $tag, $value, ...$args ) {
		return $value;
	}
}

if ( ! function_exists( 'do_action' ) ) {
	function do_action( $tag, ...$args ) {
		// no-op in tests.
	}
}

if ( ! function_exists( 'get_option' ) ) {
	function get_option( $name, $default = false ) {
		return $GLOBALS['imgsig_test_options'][ $name ] ?? $default;
	}
}

if ( ! function_exists( 'update_option' ) ) {
	function update_option( $name, $value, $autoload = null ) {
		$GLOBALS['imgsig_test_options'][ $name ] = $value;
		return true;
	}
}

if ( ! function_exists( 'add_option' ) ) {
	function add_option( $name, $value, $deprecated = '', $autoload = 'yes' ) {
		if ( array_key_exists( $name, $GLOBALS['imgsig_test_options'] ) ) {
			return false;
		}
		$GLOBALS['imgsig_test_options'][ $name ] = $value;
		return true;
	}
}

if ( ! function_exists( 'delete_option' ) ) {
	function delete_option( $name ) {
		unset( $GLOBALS['imgsig_test_options'][ $name ] );
		return true;
	}
}

if ( ! function_exists( 'get_transient' ) ) {
	function get_transient( $key ) {
		return $GLOBALS['imgsig_test_transients'][ $key ] ?? false;
	}
}

if ( ! function_exists( 'set_transient' ) ) {
	function set_transient( $key, $value, $expiration = 0 ) {
		$GLOBALS['imgsig_test_transients'][ $key ] = $value;
		return true;
	}
}

if ( ! function_exists( 'delete_transient' ) ) {
	function delete_transient( $key ) {
		unset( $GLOBALS['imgsig_test_transients'][ $key ] );
		return true;
	}
}

if ( ! function_exists( 'wp_kses' ) ) {
	function wp_kses( $string, $allowed_html = [] ) {
		return strip_tags( (string) $string, '<a><b><strong><i><em><u><span><br>' );
	}
}

if ( ! function_exists( 'add_filter' ) ) {
	function add_filter( $tag, $cb, $priority = 10, $accepted_args = 1 ) {
		return true;
	}
}

if ( ! function_exists( 'remove_filter' ) ) {
	function remove_filter( $tag, $cb, $priority = 10 ) {
		return true;
	}
}
