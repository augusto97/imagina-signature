<?php
/**
 * In-memory WordPress doubles for the directory tests (profile fields,
 * groups, import, REST permissions).
 *
 * @package ImaginaSignatures\Tests\Unit\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Directory;

use Brain\Monkey\Functions;
use ImaginaSignatures\Tests\Unit\Settings\BrandKitStubs;

require_once __DIR__ . '/../Settings/BrandKitStubs.php';

/**
 * Users, user meta, options, capabilities and a user taxonomy, all in
 * arrays. Must run after `Brain\Monkey\setUp()`.
 */
trait DirectoryStubs {

	use BrandKitStubs;

	/** @var array<int, array<string, mixed>> */
	protected array $user_meta = [];

	/** @var array<string, mixed> */
	protected array $options = [];

	/** @var array<int, object> */
	protected array $users = [];

	/** @var array<string, bool> */
	protected array $caps = [];

	/** @var int */
	protected int $current_user = 0;

	/** @var array<int, array{term_id: int, name: string, slug: string, description: string}> */
	protected array $terms = [];

	/** @var array<int, array<string, mixed>> */
	protected array $term_meta = [];

	/** @var array<int, int[]> user id => term ids */
	protected array $relationships = [];

	/** @var int */
	protected int $next_term_id = 100;

	/**
	 * @param int                  $id    User id.
	 * @param string               $email Email.
	 * @param array<string, mixed> $props Extra props.
	 */
	protected function add_user( int $id, string $email, array $props = [] ): object {
		$user               = new \WP_User(
			array_merge(
				[
					'ID'           => $id,
					'user_email'   => $email,
					'display_name' => 'User ' . $id,
				],
				$props
			)
		);
		$user->roles        = $props['roles'] ?? [ 'author' ];
		$this->users[ $id ] = $user;
		return $user;
	}

	/**
	 * @param string               $name Group name.
	 * @param array<string, mixed> $meta Term meta.
	 */
	protected function add_term( string $name, array $meta = [] ): int {
		$id                     = $this->next_term_id++;
		$this->terms[ $id ]     = [
			'term_id'     => $id,
			'name'        => $name,
			'slug'        => strtolower( (string) preg_replace( '/[^a-z0-9]+/i', '-', $name ) ),
			'description' => '',
		];
		$this->term_meta[ $id ] = $meta;
		return $id;
	}

	private function term_object( int $id ): ?object {
		if ( ! isset( $this->terms[ $id ] ) ) {
			return null;
		}
		$count = 0;
		foreach ( $this->relationships as $ids ) {
			if ( in_array( $id, $ids, true ) ) {
				++$count;
			}
		}
		return (object) ( $this->terms[ $id ] + [
			'taxonomy' => 'imgsig_group',
			'count'    => $count,
		] );
	}

	/**
	 * @param int[] $ids Term ids.
	 * @return int[] Sorted by term name.
	 */
	private function sort_by_name( array $ids ): array {
		$ids = array_values( array_filter( $ids, fn ( $id ) => isset( $this->terms[ $id ] ) ) );
		usort( $ids, fn ( $a, $b ) => strcasecmp( $this->terms[ $a ]['name'], $this->terms[ $b ]['name'] ) );
		return $ids;
	}

	private function stub_directory(): void {
		$this->stub_sanitizers();
		// WordPress' real kses (wp_kses_post) — a Brain Monkey stub would
		// collide with the fixture other tests load.
		imgsig_tests_load_kses();

		Functions\when( '__' )->returnArg( 1 );
		Functions\when( 'translate_user_role' )->returnArg( 1 );
		Functions\when( 'sanitize_textarea_field' )->alias( static fn ( $v ): string => trim( strip_tags( (string) $v ) ) );
		Functions\when( 'sanitize_key' )->alias( static fn ( $v ): string => (string) preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $v ) ) );
		Functions\when( 'sanitize_title' )->alias( static fn ( $v ): string => strtolower( trim( (string) preg_replace( '/[^a-z0-9]+/i', '-', (string) $v ), '-' ) ) );
		Functions\when( 'sanitize_user' )->alias( static fn ( $v ): string => (string) preg_replace( '/[^a-z0-9_.\-@]/i', '', (string) $v ) );
		Functions\when( 'is_email' )->alias( static fn ( $v ) => false !== filter_var( (string) $v, FILTER_VALIDATE_EMAIL ) ? $v : false );
		Functions\when( 'rest_sanitize_boolean' )->alias( static fn ( $v ): bool => is_bool( $v ) ? $v : filter_var( $v, FILTER_VALIDATE_BOOLEAN ) );
		Functions\when( 'is_wp_error' )->alias( static fn ( $v ): bool => $v instanceof \WP_Error );
		Functions\when( 'is_multisite' )->justReturn( false );
		Functions\when( 'get_avatar_url' )->justReturn( 'https://gravatar.test/a.png' );
		Functions\when( 'rest_ensure_response' )->alias(
			static fn ( $data ) => $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data )
		);

		// Options.
		Functions\when( 'get_option' )->alias(
			fn ( $name, $default = false ) => array_key_exists( $name, $this->options ) ? $this->options[ $name ] : $default
		);
		Functions\when( 'update_option' )->alias(
			function ( $name, $value ): bool {
				$this->options[ $name ] = $value;
				return true;
			}
		);
		Functions\when( 'get_transient' )->justReturn( false );
		Functions\when( 'set_transient' )->justReturn( true );

		// Users + capabilities.
		Functions\when( 'get_current_user_id' )->alias( fn (): int => $this->current_user );
		Functions\when( 'is_user_logged_in' )->alias( fn (): bool => $this->current_user > 0 );
		Functions\when( 'current_user_can' )->alias( fn ( $cap ): bool => ! empty( $this->caps[ $cap ] ) );
		Functions\when( 'user_can' )->alias( fn ( $user, $cap ): bool => 'imgsig_use_signatures' === $cap );
		Functions\when( 'get_userdata' )->alias( fn ( $id ) => $this->users[ (int) $id ] ?? false );
		Functions\when( 'get_user_by' )->alias(
			function ( $field, $value ) {
				foreach ( $this->users as $user ) {
					if ( 'email' === $field && 0 === strcasecmp( (string) $user->user_email, (string) $value ) ) {
						return $user;
					}
				}
				return false;
			}
		);
		Functions\when( 'get_users' )->alias(
			fn ( $args ) => array_values( array_intersect( array_map( 'intval', (array) ( $args['include'] ?? [] ) ), array_keys( $this->users ) ) )
		);

		// User meta.
		Functions\when( 'get_user_meta' )->alias(
			fn ( $id, $key = '', $single = false ) => $this->user_meta[ (int) $id ][ $key ] ?? ( $single ? '' : [] )
		);
		Functions\when( 'update_user_meta' )->alias(
			function ( $id, $key, $value ): bool {
				$this->user_meta[ (int) $id ][ $key ] = $value;
				return true;
			}
		);
		Functions\when( 'delete_user_meta' )->alias(
			function ( $id, $key ): bool {
				unset( $this->user_meta[ (int) $id ][ $key ] );
				return true;
			}
		);

		// Taxonomy.
		Functions\when( 'taxonomy_exists' )->justReturn( true );
		Functions\when( 'get_term' )->alias( fn ( $id ) => $this->term_object( (int) $id ) );
		Functions\when( 'get_terms' )->alias(
			fn () => array_map( fn ( $id ) => $this->term_object( $id ), $this->sort_by_name( array_keys( $this->terms ) ) )
		);
		Functions\when( 'get_term_by' )->alias(
			function ( $field, $value ) {
				foreach ( $this->terms as $id => $term ) {
					if ( 'slug' === $field && $term['slug'] === $value ) {
						return $this->term_object( $id );
					}
				}
				return false;
			}
		);
		Functions\when( 'wp_insert_term' )->alias(
			function ( $name, $tax, $args = [] ) {
				foreach ( $this->terms as $term ) {
					if ( 0 === strcasecmp( $term['name'], (string) $name ) ) {
						return new \WP_Error( 'term_exists', 'exists' );
					}
				}
				$id                              = $this->add_term( (string) $name );
				$this->terms[ $id ]['description'] = (string) ( $args['description'] ?? '' );
				return [
					'term_id'          => $id,
					'term_taxonomy_id' => $id,
				];
			}
		);
		Functions\when( 'wp_update_term' )->alias(
			function ( $id, $tax, $args ) {
				foreach ( [ 'name', 'description' ] as $key ) {
					if ( isset( $args[ $key ] ) ) {
						$this->terms[ (int) $id ][ $key ] = (string) $args[ $key ];
					}
				}
				return [ 'term_id' => (int) $id ];
			}
		);
		Functions\when( 'wp_delete_term' )->alias(
			function ( $id ): bool {
				unset( $this->terms[ (int) $id ], $this->term_meta[ (int) $id ] );
				foreach ( $this->relationships as $user => $ids ) {
					$this->relationships[ $user ] = array_values( array_diff( $ids, [ (int) $id ] ) );
				}
				return true;
			}
		);
		Functions\when( 'get_term_meta' )->alias( fn ( $id, $key = '', $single = false ) => $this->term_meta[ (int) $id ][ $key ] ?? '' );
		Functions\when( 'update_term_meta' )->alias(
			function ( $id, $key, $value ): bool {
				$this->term_meta[ (int) $id ][ $key ] = $value;
				return true;
			}
		);
		Functions\when( 'delete_term_meta' )->alias(
			function ( $id, $key ): bool {
				unset( $this->term_meta[ (int) $id ][ $key ] );
				return true;
			}
		);
		Functions\when( 'wp_get_object_terms' )->alias(
			function ( $object_ids, $tax, $args = [] ) {
				if ( is_array( $object_ids ) ) {
					$out = [];
					foreach ( $object_ids as $user_id ) {
						foreach ( $this->sort_by_name( $this->relationships[ (int) $user_id ] ?? [] ) as $id ) {
							$term            = $this->term_object( $id );
							$term->object_id = (int) $user_id;
							$out[]           = $term;
						}
					}
					return $out;
				}
				return $this->sort_by_name( $this->relationships[ (int) $object_ids ] ?? [] );
			}
		);
		Functions\when( 'get_objects_in_term' )->alias(
			function ( $term_id ): array {
				$out = [];
				foreach ( $this->relationships as $user_id => $ids ) {
					if ( in_array( (int) $term_id, $ids, true ) ) {
						$out[] = (string) $user_id;
					}
				}
				return $out;
			}
		);
		Functions\when( 'wp_add_object_terms' )->alias(
			function ( $user_id, $term_id ): array {
				$this->relationships[ (int) $user_id ][] = (int) $term_id;
				$this->relationships[ (int) $user_id ]   = array_values( array_unique( $this->relationships[ (int) $user_id ] ) );
				return [ (int) $term_id ];
			}
		);
		Functions\when( 'wp_remove_object_terms' )->alias(
			function ( $user_id, $term_id ): bool {
				$this->relationships[ (int) $user_id ] = array_values( array_diff( $this->relationships[ (int) $user_id ] ?? [], [ (int) $term_id ] ) );
				return true;
			}
		);
		Functions\when( 'wp_set_object_terms' )->alias(
			function ( $user_id, $ids ): array {
				$this->relationships[ (int) $user_id ] = array_values( array_map( 'intval', (array) $ids ) );
				return $this->relationships[ (int) $user_id ];
			}
		);
		Functions\when( 'wp_delete_object_term_relationships' )->alias(
			function ( $user_id ): void {
				unset( $this->relationships[ (int) $user_id ] );
			}
		);
	}
}
