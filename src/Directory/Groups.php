<?php
/**
 * Groups / departments of signature users.
 *
 * @package ImaginaSignatures\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Directory;

use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Groups are terms of the `imgsig_group` taxonomy registered on the
 * `user` object type (no core UI — the plugin's admin app manages
 * them). A user can belong to several groups.
 *
 * Term meta:
 *  - `imgsig_color`           `#rrggbb` chip colour;
 *  - `imgsig_template_id`     template assigned to the group (null = none),
 *                             consumed by the team console;
 *  - `imgsig_footer_override` `{enabled, html}` — replaces the global
 *                             compliance footer for the group's members.
 *
 * Group order is alphabetical by name everywhere ({@see for_user()}),
 * which is what decides "the first group" for footer overrides.
 *
 * @since 1.3.0
 */
final class Groups {

	public const TAXONOMY = 'imgsig_group';

	public const META_COLOR    = 'imgsig_color';
	public const META_TEMPLATE = 'imgsig_template_id';
	public const META_FOOTER   = 'imgsig_footer_override';

	public const DEFAULT_COLOR = '#64748b';

	public const MAX_NAME_LENGTH = 100;

	/** Most user ids accepted by one {@see set_members()} call. */
	public const MAX_MEMBERS_PER_WRITE = 5000;

	/**
	 * Hooks the taxonomy registration and user-deletion cleanup.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public static function boot(): void {
		add_action( 'init', [ self::class, 'register' ], 5 );
		add_action( 'deleted_user', [ self::class, 'forget_user' ] );
		add_action( 'remove_user_from_blog', [ self::class, 'forget_user' ] );
	}

	/**
	 * Registers the user taxonomy (idempotent).
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public static function register(): void {
		if ( taxonomy_exists( self::TAXONOMY ) ) {
			return;
		}

		register_taxonomy(
			self::TAXONOMY,
			'user',
			[
				'labels'                => [
					'name'          => __( 'Signature groups', 'imagina-signatures' ),
					'singular_name' => __( 'Signature group', 'imagina-signatures' ),
				],
				'public'                => false,
				'publicly_queryable'    => false,
				'show_ui'               => false,
				'show_in_menu'          => false,
				'show_in_nav_menus'     => false,
				'show_tagcloud'         => false,
				'show_in_quick_edit'    => false,
				'show_admin_column'     => false,
				'show_in_rest'          => false,
				'hierarchical'          => false,
				'rewrite'               => false,
				'query_var'             => false,
				'capabilities'          => [
					'manage_terms' => CapabilitiesInstaller::CAP_MANAGE_TEAM,
					'edit_terms'   => CapabilitiesInstaller::CAP_MANAGE_TEAM,
					'delete_terms' => CapabilitiesInstaller::CAP_MANAGE_TEAM,
					'assign_terms' => CapabilitiesInstaller::CAP_MANAGE_TEAM,
				],
				// Counts relationships of any object type (users here),
				// so `count` is the member count.
				'update_count_callback' => '_update_generic_term_count',
			]
		);
	}

	/**
	 * Group ids a user belongs to, alphabetical by group name.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return int[]
	 */
	public static function for_user( int $user_id ): array {
		if ( $user_id <= 0 ) {
			return [];
		}
		$ids = wp_get_object_terms(
			$user_id,
			self::TAXONOMY,
			[
				'fields'  => 'ids',
				'orderby' => 'name',
				'order'   => 'ASC',
			]
		);
		if ( ! is_array( $ids ) ) {
			return [];
		}
		return array_values( array_map( 'intval', $ids ) );
	}

	/**
	 * Group ids of several users in one query, alphabetical by group name.
	 *
	 * @since 1.3.0
	 *
	 * @param int[] $user_ids Users.
	 *
	 * @return array<int, int[]> User id => group ids (users without groups are absent).
	 */
	public static function for_users( array $user_ids ): array {
		$user_ids = array_values( array_filter( array_map( 'intval', $user_ids ) ) );
		if ( empty( $user_ids ) ) {
			return [];
		}
		$terms = wp_get_object_terms(
			$user_ids,
			self::TAXONOMY,
			[
				'fields'  => 'all_with_object_id',
				'orderby' => 'name',
				'order'   => 'ASC',
			]
		);
		$out   = [];
		foreach ( is_array( $terms ) ? $terms : [] as $term ) {
			if ( is_object( $term ) && isset( $term->object_id, $term->term_id ) ) {
				$out[ (int) $term->object_id ][] = (int) $term->term_id;
			}
		}
		return $out;
	}

	/**
	 * User ids in a group, ascending.
	 *
	 * @since 1.3.0
	 *
	 * @param int $group_id Group (term id).
	 *
	 * @return int[]
	 */
	public static function members( int $group_id ): array {
		if ( $group_id <= 0 ) {
			return [];
		}
		$ids = get_objects_in_term( $group_id, self::TAXONOMY );
		if ( ! is_array( $ids ) ) {
			return [];
		}
		$ids = array_map( 'intval', $ids );
		sort( $ids );
		return array_values( array_unique( $ids ) );
	}

	/**
	 * Every group, alphabetical, formatted ({@see format()}).
	 *
	 * @since 1.3.0
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function all(): array {
		$terms = get_terms(
			[
				'taxonomy'   => self::TAXONOMY,
				'hide_empty' => false,
				'orderby'    => 'name',
				'order'      => 'ASC',
			]
		);
		if ( ! is_array( $terms ) ) {
			return [];
		}
		$out = [];
		foreach ( $terms as $term ) {
			if ( is_object( $term ) ) {
				$out[] = self::format( $term );
			}
		}
		return $out;
	}

	/**
	 * One group, formatted, or null when it does not exist.
	 *
	 * @since 1.3.0
	 *
	 * @param int $group_id Group.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function get( int $group_id ): ?array {
		$term = self::term( $group_id );
		return null === $term ? null : self::format( $term );
	}

	/**
	 * Id of the group with this name (case-insensitive) or slug; 0 when none.
	 *
	 * @since 1.3.0
	 *
	 * @param string $name Group name.
	 *
	 * @return int
	 */
	public static function find_by_name( string $name ): int {
		$name = trim( $name );
		if ( '' === $name ) {
			return 0;
		}
		foreach ( self::all() as $group ) {
			if ( 0 === strcasecmp( (string) $group['name'], $name ) ) {
				return (int) $group['id'];
			}
		}
		$term = get_term_by( 'slug', sanitize_title( $name ), self::TAXONOMY );
		return is_object( $term ) ? (int) $term->term_id : 0;
	}

	/**
	 * Creates a group.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $data name (required), description, color, template_id, compliance_footer_override.
	 *
	 * @return array<string, mixed>|\WP_Error The formatted group.
	 */
	public static function create( array $data ) {
		$name = self::sanitize_name( $data['name'] ?? '' );
		if ( '' === $name ) {
			return new \WP_Error( 'imgsig_validation_failed', __( 'The group needs a name.', 'imagina-signatures' ), [ 'status' => 400 ] );
		}

		$result = wp_insert_term(
			$name,
			self::TAXONOMY,
			[ 'description' => self::sanitize_description( $data['description'] ?? '' ) ]
		);
		if ( is_wp_error( $result ) ) {
			return self::term_error( $result );
		}

		$group_id = (int) $result['term_id'];
		self::write_meta( $group_id, $data + [ 'color' => self::DEFAULT_COLOR ] );

		/**
		 * Fires after a group is created or updated.
		 *
		 * @since 1.3.0
		 *
		 * @param int    $group_id Group.
		 * @param string $event    `created` | `updated`.
		 */
		do_action( 'imgsig/group/saved', $group_id, 'created' );

		return self::get( $group_id ) ?? new \WP_Error( 'imgsig_error', __( 'The group could not be created.', 'imagina-signatures' ), [ 'status' => 500 ] );
	}

	/**
	 * Updates the fields present in `$data` (partial update).
	 *
	 * @since 1.3.0
	 *
	 * @param int                  $group_id Group.
	 * @param array<string, mixed> $data     Fields to change.
	 *
	 * @return array<string, mixed>|\WP_Error
	 */
	public static function update( int $group_id, array $data ) {
		if ( null === self::term( $group_id ) ) {
			return self::not_found();
		}

		$args = [];
		if ( array_key_exists( 'name', $data ) ) {
			$name = self::sanitize_name( $data['name'] );
			if ( '' === $name ) {
				return new \WP_Error( 'imgsig_validation_failed', __( 'The group needs a name.', 'imagina-signatures' ), [ 'status' => 400 ] );
			}
			$args['name'] = $name;
		}
		if ( array_key_exists( 'description', $data ) ) {
			$args['description'] = self::sanitize_description( $data['description'] );
		}
		if ( ! empty( $args ) ) {
			$result = wp_update_term( $group_id, self::TAXONOMY, $args );
			if ( is_wp_error( $result ) ) {
				return self::term_error( $result );
			}
		}

		self::write_meta( $group_id, $data );

		/** This action is documented in {@see create()}. */
		do_action( 'imgsig/group/saved', $group_id, 'updated' );

		return self::get( $group_id ) ?? self::not_found();
	}

	/**
	 * Deletes a group (memberships go with it).
	 *
	 * @since 1.3.0
	 *
	 * @param int $group_id Group.
	 *
	 * @return true|\WP_Error
	 */
	public static function delete( int $group_id ) {
		if ( null === self::term( $group_id ) ) {
			return self::not_found();
		}
		$result = wp_delete_term( $group_id, self::TAXONOMY );
		if ( is_wp_error( $result ) ) {
			return self::term_error( $result );
		}
		if ( true !== $result ) {
			return new \WP_Error( 'imgsig_error', __( 'The group could not be deleted.', 'imagina-signatures' ), [ 'status' => 500 ] );
		}

		/**
		 * Fires after a group is deleted.
		 *
		 * @since 1.3.0
		 *
		 * @param int $group_id Deleted group.
		 */
		do_action( 'imgsig/group/deleted', $group_id );

		return true;
	}

	/**
	 * Replaces a group's members. Ids that are not users of this site are
	 * ignored.
	 *
	 * @since 1.3.0
	 *
	 * @param int   $group_id Group.
	 * @param int[] $user_ids New member list.
	 *
	 * @return array{added: int[], removed: int[]}|\WP_Error
	 */
	public static function set_members( int $group_id, array $user_ids ) {
		if ( null === self::term( $group_id ) ) {
			return self::not_found();
		}

		$wanted = self::existing_user_ids( $user_ids );
		$before = self::members( $group_id );
		$added  = array_values( array_diff( $wanted, $before ) );
		$gone   = array_values( array_diff( $before, $wanted ) );

		foreach ( $added as $user_id ) {
			wp_add_object_terms( $user_id, $group_id, self::TAXONOMY );
		}
		foreach ( $gone as $user_id ) {
			wp_remove_object_terms( $user_id, $group_id, self::TAXONOMY );
		}

		if ( ! empty( $added ) || ! empty( $gone ) ) {
			self::announce_members_changed( $group_id, $added, $gone );
		}

		return [
			'added'   => $added,
			'removed' => $gone,
		];
	}

	/**
	 * Adds one user to one group (no-op when already a member).
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id  User.
	 * @param int $group_id Group.
	 *
	 * @return bool True when the membership was added.
	 */
	public static function add_member( int $user_id, int $group_id ): bool {
		if ( $user_id <= 0 || null === self::term( $group_id ) || in_array( $group_id, self::for_user( $user_id ), true ) ) {
			return false;
		}
		$result = wp_add_object_terms( $user_id, $group_id, self::TAXONOMY );
		if ( is_wp_error( $result ) ) {
			return false;
		}
		self::announce_members_changed( $group_id, [ $user_id ], [] );
		return true;
	}

	/**
	 * Replaces the groups of one user.
	 *
	 * @since 1.3.0
	 *
	 * @param int   $user_id   User.
	 * @param int[] $group_ids Groups.
	 *
	 * @return void
	 */
	public static function set_user_groups( int $user_id, array $group_ids ): void {
		if ( $user_id <= 0 ) {
			return;
		}
		$valid = [];
		foreach ( $group_ids as $group_id ) {
			$group_id = (int) $group_id;
			if ( $group_id > 0 && null !== self::term( $group_id ) ) {
				$valid[] = $group_id;
			}
		}
		$valid  = array_values( array_unique( $valid ) );
		$before = self::for_user( $user_id );
		if ( array_diff( $valid, $before ) === [] && array_diff( $before, $valid ) === [] ) {
			return;
		}

		wp_set_object_terms( $user_id, $valid, self::TAXONOMY, false );

		foreach ( array_diff( $valid, $before ) as $group_id ) {
			self::announce_members_changed( (int) $group_id, [ $user_id ], [] );
		}
		foreach ( array_diff( $before, $valid ) as $group_id ) {
			self::announce_members_changed( (int) $group_id, [], [ $user_id ] );
		}
	}

	/**
	 * Drops every group membership of a deleted / removed user.
	 *
	 * @since 1.3.0
	 *
	 * @param int|string $user_id User.
	 *
	 * @return void
	 */
	public static function forget_user( $user_id ): void {
		$user_id = (int) $user_id;
		if ( $user_id > 0 && taxonomy_exists( self::TAXONOMY ) ) {
			wp_delete_object_term_relationships( $user_id, self::TAXONOMY );
		}
	}

	/**
	 * A group's footer override, sanitised.
	 *
	 * @since 1.3.0
	 *
	 * @param int $group_id Group.
	 *
	 * @return array{enabled: bool, html: string}
	 */
	public static function footer_override( int $group_id ): array {
		$raw = get_term_meta( $group_id, self::META_FOOTER, true );
		return [
			'enabled' => is_array( $raw ) && ! empty( $raw['enabled'] ),
			'html'    => is_array( $raw ) && isset( $raw['html'] ) && is_string( $raw['html'] ) ? $raw['html'] : '',
		];
	}

	/**
	 * The compliance footer that applies to a user: the override of the
	 * first of their groups (alphabetical) that has one enabled — an
	 * enabled override with empty HTML means "no footer" — else the
	 * site-wide footer.
	 *
	 * @since 1.3.0
	 *
	 * @param int                                     $user_id User.
	 * @param array{enabled: bool, html: string}|null $global  Site-wide footer (null reads it).
	 *
	 * @return array{enabled: bool, html: string}
	 */
	public static function effective_compliance_footer( int $user_id, ?array $global = null ): array {
		foreach ( self::for_user( $user_id ) as $group_id ) {
			$override = self::footer_override( $group_id );
			if ( $override['enabled'] ) {
				return [
					'enabled' => '' !== trim( $override['html'] ),
					'html'    => $override['html'],
				];
			}
		}

		$global = null === $global ? SiteSettingsController::current_compliance_footer() : $global;
		return [
			'enabled' => ! empty( $global['enabled'] ),
			'html'    => isset( $global['html'] ) ? (string) $global['html'] : '',
		];
	}

	/**
	 * Public shape of a group.
	 *
	 * @since 1.3.0
	 *
	 * @param object $term WP_Term.
	 *
	 * @return array{id: int, name: string, slug: string, description: string, color: string, template_id: int|null, compliance_footer_override: array{enabled: bool, html: string}, member_count: int}
	 */
	public static function format( $term ): array {
		$id       = (int) $term->term_id;
		$color    = get_term_meta( $id, self::META_COLOR, true );
		$template = (int) get_term_meta( $id, self::META_TEMPLATE, true );

		return [
			'id'                         => $id,
			'name'                       => (string) $term->name,
			'slug'                       => (string) $term->slug,
			'description'                => (string) $term->description,
			'color'                      => is_string( $color ) && '' !== self::sanitize_color( $color ) ? self::sanitize_color( $color ) : self::DEFAULT_COLOR,
			'template_id'                => $template > 0 ? $template : null,
			'compliance_footer_override' => self::footer_override( $id ),
			'member_count'               => (int) $term->count,
		];
	}

	/**
	 * `#rgb` / `#rrggbb` lower-cased, or ''.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $value Raw colour.
	 *
	 * @return string
	 */
	public static function sanitize_color( $value ): string {
		$value = is_string( $value ) ? strtolower( trim( $value ) ) : '';
		return preg_match( '/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/', $value ) ? $value : '';
	}

	/**
	 * Writes the meta fields present in `$data`.
	 *
	 * @param int                  $group_id Group.
	 * @param array<string, mixed> $data     Input.
	 *
	 * @return void
	 */
	private static function write_meta( int $group_id, array $data ): void {
		if ( array_key_exists( 'color', $data ) ) {
			$color = self::sanitize_color( $data['color'] );
			update_term_meta( $group_id, self::META_COLOR, '' !== $color ? $color : self::DEFAULT_COLOR );
		}

		if ( array_key_exists( 'template_id', $data ) ) {
			$template = is_numeric( $data['template_id'] ) ? (int) $data['template_id'] : 0;
			if ( $template > 0 ) {
				update_term_meta( $group_id, self::META_TEMPLATE, $template );
			} else {
				delete_term_meta( $group_id, self::META_TEMPLATE );
			}
		}

		if ( array_key_exists( 'compliance_footer_override', $data ) ) {
			$raw = is_array( $data['compliance_footer_override'] ) ? $data['compliance_footer_override'] : [];
			update_term_meta(
				$group_id,
				self::META_FOOTER,
				[
					'enabled' => ! empty( $raw['enabled'] ) && rest_sanitize_boolean( $raw['enabled'] ),
					'html'    => isset( $raw['html'] ) && is_string( $raw['html'] ) ? wp_kses_post( $raw['html'] ) : '',
				]
			);
		}
	}

	/**
	 * The term, or null when it is missing or in another taxonomy.
	 *
	 * @param int $group_id Term id.
	 *
	 * @return object|null
	 */
	private static function term( int $group_id ) {
		if ( $group_id <= 0 ) {
			return null;
		}
		$term = get_term( $group_id, self::TAXONOMY );
		return is_object( $term ) && ! is_wp_error( $term ) && self::TAXONOMY === $term->taxonomy ? $term : null;
	}

	/**
	 * @param int[]|mixed $user_ids Raw ids.
	 *
	 * @return int[] Ids of users that exist on this site, ascending.
	 */
	private static function existing_user_ids( $user_ids ): array {
		$ids = [];
		foreach ( is_array( $user_ids ) ? $user_ids : [] as $id ) {
			$id = is_numeric( $id ) ? (int) $id : 0;
			if ( $id > 0 ) {
				$ids[ $id ] = $id;
			}
		}
		if ( empty( $ids ) ) {
			return [];
		}
		$ids = array_slice( array_values( $ids ), 0, self::MAX_MEMBERS_PER_WRITE );

		$found = get_users(
			[
				'include' => $ids,
				'fields'  => 'ID',
				'number'  => count( $ids ),
			]
		);
		$found = array_map( 'intval', is_array( $found ) ? $found : [] );
		sort( $found );
		return array_values( $found );
	}

	/**
	 * @param int   $group_id Group.
	 * @param int[] $added    Users added.
	 * @param int[] $removed  Users removed.
	 *
	 * @return void
	 */
	private static function announce_members_changed( int $group_id, array $added, array $removed ): void {
		/**
		 * Fires after users join or leave a group. Their effective footer,
		 * campaigns and assigned template may have changed.
		 *
		 * @since 1.3.0
		 *
		 * @param int   $group_id Group.
		 * @param int[] $added    Users added.
		 * @param int[] $removed  Users removed.
		 */
		do_action( 'imgsig/group/members_changed', $group_id, $added, $removed );
	}

	/**
	 * @param string|mixed $name Raw name.
	 *
	 * @return string
	 */
	private static function sanitize_name( $name ): string {
		$name = is_scalar( $name ) ? sanitize_text_field( (string) $name ) : '';
		return function_exists( 'mb_substr' ) ? mb_substr( $name, 0, self::MAX_NAME_LENGTH ) : substr( $name, 0, self::MAX_NAME_LENGTH );
	}

	/**
	 * @param string|mixed $description Raw description.
	 *
	 * @return string
	 */
	private static function sanitize_description( $description ): string {
		return is_scalar( $description ) ? sanitize_textarea_field( (string) $description ) : '';
	}

	/**
	 * Maps a term API error onto the plugin's error contract.
	 *
	 * @param \WP_Error $error Term API error.
	 *
	 * @return \WP_Error
	 */
	private static function term_error( \WP_Error $error ): \WP_Error {
		if ( 'term_exists' === $error->get_error_code() ) {
			return new \WP_Error( 'imgsig_group_exists', __( 'A group with this name already exists.', 'imagina-signatures' ), [ 'status' => 409 ] );
		}
		return new \WP_Error( 'imgsig_validation_failed', $error->get_error_message(), [ 'status' => 400 ] );
	}

	/**
	 * @return \WP_Error
	 */
	private static function not_found(): \WP_Error {
		return new \WP_Error( 'imgsig_not_found', __( 'Group not found.', 'imagina-signatures' ), [ 'status' => 404 ] );
	}
}
