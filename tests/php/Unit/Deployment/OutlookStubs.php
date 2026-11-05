<?php
/**
 * WordPress stand-ins shared by the Outlook add-in tests.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey\Functions;

require_once __DIR__ . '/../../fixtures/wp-user-stub.php';
require_once __DIR__ . '/../Settings/BrandKitStubs.php';

if ( ! defined( 'IMGSIG_FILE' ) ) {
	define( 'IMGSIG_FILE', '/tmp/wordpress/wp-content/plugins/imagina-signatures/imagina-signatures.php' );
}

/**
 * `WP_REST_Request` double with headers, method and route — the shared
 * stub only carries params.
 */
class Imgsig_Outlook_Request extends \WP_REST_Request { // phpcs:ignore

	/** @var array<string, string> */
	private array $headers = [];

	/** @var string */
	private string $method;

	/**
	 * @param string                $method  HTTP method.
	 * @param string                $route   Route.
	 * @param array<string, mixed>  $params  Params.
	 * @param array<string, string> $headers Headers (any case).
	 */
	public function __construct( string $method = 'GET', string $route = '', array $params = [], array $headers = [] ) {
		parent::__construct( $params );
		$this->method = $method;
		$this->set_route( $route );
		foreach ( $headers as $name => $value ) {
			$this->headers[ self::canonical( $name ) ] = $value;
		}
	}

	/**
	 * Mirrors WP_REST_Request::get_header() (case-insensitive, `-` ≡ `_`).
	 *
	 * @param string $key Header name.
	 *
	 * @return string|null
	 */
	public function get_header( string $key ): ?string {
		return $this->headers[ self::canonical( $key ) ] ?? null;
	}

	public function get_method(): string {
		return $this->method;
	}

	private static function canonical( string $key ): string {
		return str_replace( '-', '_', strtolower( $key ) );
	}
}

/**
 * In-memory options / user meta and URL helpers.
 */
trait OutlookStubs {

	use \ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;

	/** @var array<string, mixed> */
	private array $options = [];

	/** @var array<int, array<string, mixed>> */
	private array $meta = [];

	/** @var int Number of update_user_meta() calls. */
	private int $meta_writes = 0;

	/** @var string */
	private string $home = 'https://acme.example/';

	private function stub_outlook_wp(): void {
		$this->stub_sanitizers();

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'esc_html__' )->returnArg( 1 );
		Functions\when( 'get_option' )->alias(
			function ( $name, $default = false ) {
				return array_key_exists( $name, $this->options ) ? $this->options[ $name ] : $default;
			}
		);
		Functions\when( 'update_option' )->alias(
			function ( $name, $value ): bool {
				$this->options[ $name ] = $value;
				return true;
			}
		);
		Functions\when( 'get_user_meta' )->alias(
			function ( $user_id, $key = '', $single = false ) {
				return $this->meta[ (int) $user_id ][ $key ] ?? ( $single ? '' : [] );
			}
		);
		Functions\when( 'update_user_meta' )->alias(
			function ( $user_id, $key, $value ): bool {
				$this->meta[ (int) $user_id ][ $key ] = $value;
				++$this->meta_writes;
				return true;
			}
		);
		Functions\when( 'home_url' )->alias(
			function ( $path = '' ): string {
				return rtrim( $this->home, '/' ) . '/' . ltrim( (string) $path, '/' );
			}
		);
		Functions\when( 'rest_url' )->alias(
			function ( $path = '' ): string {
				return rtrim( $this->home, '/' ) . '/wp-json/' . ltrim( (string) $path, '/' );
			}
		);
		Functions\when( 'plugins_url' )->alias(
			function ( $path = '', $plugin = '' ): string {
				unset( $plugin );
				return rtrim( $this->home, '/' ) . '/wp-content/plugins/imagina-signatures' . ( '' !== $path ? '/' . ltrim( (string) $path, '/' ) : '' );
			}
		);
		Functions\when( 'trailingslashit' )->alias(
			static function ( $value ): string {
				return rtrim( (string) $value, '/\\' ) . '/';
			}
		);
		Functions\when( 'add_query_arg' )->alias(
			static function ( ...$args ): string {
				if ( is_array( $args[0] ) ) {
					[ $params, $url ] = $args;
				} else {
					$params = [ $args[0] => $args[1] ];
					$url    = $args[2];
				}
				return $url . ( false === strpos( $url, '?' ) ? '?' : '&' ) . http_build_query( $params );
			}
		);
		Functions\when( 'get_locale' )->justReturn( 'es_ES' );
		Functions\when( 'get_bloginfo' )->justReturn( 'Acme Blog' );
		Functions\when( 'wp_strip_all_tags' )->alias( 'strip_tags' );
		Functions\when( 'is_email' )->alias(
			static function ( $email ) {
				return false !== filter_var( (string) $email, FILTER_VALIDATE_EMAIL ) ? $email : false;
			}
		);
		Functions\when( 'rest_sanitize_boolean' )->alias(
			static function ( $value ): bool {
				return in_array( is_string( $value ) ? strtolower( $value ) : $value, [ true, 1, '1', 'true' ], true );
			}
		);
		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
			}
		);
		Functions\when( 'wp_unslash' )->returnArg( 1 );
	}
}
