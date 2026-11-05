<?php
/**
 * In-memory WordPress stand-ins shared by the install-link tests.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey\Functions;
use ImaginaSignatures\Models\Signature;

require_once __DIR__ . '/../../fixtures/wp-user-stub.php';

/**
 * Options, user meta, users and escaping doubles. Must run after
 * `Brain\Monkey\setUp()`.
 */
trait DeploymentStubs {

	/** @var array<string, mixed> */
	protected array $options = [];

	/** @var array<int, array<string, mixed>> */
	protected array $meta = [];

	/** @var array<int, \WP_User> */
	protected array $users = [];

	/** @var array<int, string[]> Capabilities per user id. */
	protected array $caps = [];

	/**
	 * Stubs the store + escaping functions.
	 */
	protected function stub_wordpress(): void {
		$this->options = [];
		$this->meta    = [];
		$this->users   = [];
		$this->caps    = [];

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
		Functions\when( 'add_option' )->alias(
			function ( $name, $value = '' ): bool {
				if ( array_key_exists( $name, $this->options ) ) {
					return false;
				}
				$this->options[ $name ] = $value;
				return true;
			}
		);
		Functions\when( 'delete_option' )->alias(
			function ( $name ): bool {
				unset( $this->options[ $name ] );
				return true;
			}
		);
		Functions\when( 'wp_cache_delete' )->justReturn( true );

		Functions\when( 'get_user_meta' )->alias(
			function ( $user_id, $key = '', $single = false ) {
				$value = $this->meta[ (int) $user_id ][ $key ] ?? '';
				return $single ? $value : ( '' === $value ? [] : [ $value ] );
			}
		);
		Functions\when( 'update_user_meta' )->alias(
			function ( $user_id, $key, $value ): bool {
				$this->meta[ (int) $user_id ][ $key ] = $value;
				return true;
			}
		);
		Functions\when( 'update_meta_cache' )->justReturn( [] );

		Functions\when( 'get_userdata' )->alias(
			function ( $user_id ) {
				return $this->users[ (int) $user_id ] ?? false;
			}
		);
		Functions\when( 'user_can' )->alias(
			function ( $user, $cap ): bool {
				$id = is_object( $user ) ? (int) $user->ID : (int) $user;
				return in_array( $cap, $this->caps[ $id ] ?? [], true );
			}
		);
		Functions\when( 'is_email' )->alias(
			static function ( $email ) {
				return false !== filter_var( $email, FILTER_VALIDATE_EMAIL ) ? $email : false;
			}
		);

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'esc_html__' )->alias( [ self::class, 'html' ] );
		Functions\when( 'esc_attr__' )->alias( [ self::class, 'html' ] );
		Functions\when( 'esc_html' )->alias( [ self::class, 'html' ] );
		// Like core: existing entities are NOT double-encoded.
		Functions\when( 'esc_attr' )->alias(
			static function ( $text ): string {
				return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8', false );
			}
		);
		Functions\when( 'esc_url' )->alias(
			static function ( $url ): string {
				return htmlspecialchars( (string) $url, ENT_QUOTES, 'UTF-8', false );
			}
		);
		Functions\when( 'sanitize_textarea_field' )->alias(
			static function ( $text ): string {
				return trim( strip_tags( (string) $text ) );
			}
		);
		Functions\when( 'wp_json_encode' )->alias(
			static function ( $data, $flags = 0 ) {
				return json_encode( $data, $flags );
			}
		);
		Functions\when( 'get_bloginfo' )->justReturn( 'Acme Site' );
	}

	/**
	 * `esc_html()` double.
	 *
	 * @param mixed $text Text.
	 */
	public static function html( $text ): string {
		return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8', false );
	}

	/**
	 * Adds a user who can use signatures.
	 *
	 * @param int                  $id    User id.
	 * @param array<string, mixed> $props Extra properties.
	 * @param string[]             $caps  Capabilities.
	 */
	protected function add_user( int $id, array $props = [], array $caps = [ 'imgsig_use_signatures' ] ): \WP_User {
		$user = new \WP_User(
			$props + [
				'ID'           => $id,
				'display_name' => 'User ' . $id,
				'first_name'   => '',
				'user_email'   => 'user' . $id . '@example.com',
			]
		);
		$this->users[ $id ] = $user;
		$this->caps[ $id ]  = $caps;
		return $user;
	}

	/**
	 * A signature row with fresh (or stale) server HTML.
	 *
	 * @param int    $user_id Owner.
	 * @param bool   $fresh   Compiled after the last edit.
	 * @param string $html    Fragment.
	 */
	protected static function signature( int $user_id, bool $fresh = true, string $html = '<table role="presentation"><tr><td>Ana</td></tr></table>' ): Signature {
		return Signature::from_row(
			[
				'id'          => 40 + $user_id,
				'user_id'     => $user_id,
				'name'        => 'Main',
				'html_cache'  => $html,
				'html_text'   => 'Ana',
				'html_hash'   => hash( 'sha256', $html ),
				'compiled_at' => $fresh ? '2026-11-01 10:00:00' : '2026-10-01 10:00:00',
				'updated_at'  => '2026-11-01 10:00:00',
				'status'      => 'ready',
			]
		);
	}

	/**
	 * A signature row that was never compiled on the server (no HTML).
	 *
	 * @param int $user_id Owner.
	 */
	protected static function never_compiled( int $user_id ): Signature {
		return Signature::from_row(
			[
				'id'          => 40 + $user_id,
				'user_id'     => $user_id,
				'name'        => 'Main',
				'html_cache'  => null,
				'compiled_at' => null,
				'updated_at'  => '2026-11-01 10:00:00',
				'status'      => 'ready',
			]
		);
	}
}
