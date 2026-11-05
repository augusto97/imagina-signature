<?php
/**
 * Groups and user directory REST endpoints.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Directory\Groups;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Every route requires `imgsig_manage_team`:
 *
 *   GET    /admin/groups                    all groups (with member counts)
 *   POST   /admin/groups                    create { name, description, color, template_id, compliance_footer_override }
 *   GET    /admin/groups/{id}               one group (+ member_ids)
 *   PATCH  /admin/groups/{id}               partial update (POST / PUT accepted)
 *   DELETE /admin/groups/{id}
 *   PUT    /admin/groups/{id}/members       { user_ids } — replaces the member list
 *   GET    /admin/users                     ?search, role, group, page, per_page
 *
 * @since 1.3.0
 */
final class GroupsController extends BaseController {

	public const MAX_PER_PAGE = 100;

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_team = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM );

		register_rest_route(
			self::NAMESPACE,
			'/admin/groups',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'index' ],
					'permission_callback' => $require_team,
				],
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'create' ],
					'permission_callback' => $require_team,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/groups/(?P<id>\d+)',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $require_team,
				],
				[
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $require_team,
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [ $this, 'delete' ],
					'permission_callback' => $require_team,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/groups/(?P<id>\d+)/members',
			[
				[
					// PUT is the contract; POST accepted for WAFs that strip PUT.
					'methods'             => 'PUT, POST',
					'callback'            => [ $this, 'set_members' ],
					'permission_callback' => $require_team,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/users',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'users' ],
					'permission_callback' => $require_team,
					'args'                => [
						'search'   => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						],
						'role'     => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_key',
						],
						'group'    => [ 'type' => 'integer' ],
						'page'     => [ 'type' => 'integer' ],
						'per_page' => [ 'type' => 'integer' ],
					],
				],
			]
		);
	}

	/**
	 * `GET /admin/groups`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function index(): \WP_REST_Response {
		return rest_ensure_response( Groups::all() );
	}

	/**
	 * `POST /admin/groups`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function create( \WP_REST_Request $request ) {
		$group = Groups::create( self::group_input( $request ) );
		if ( is_wp_error( $group ) ) {
			return $group;
		}
		$response = rest_ensure_response( $group );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * `GET /admin/groups/{id}` — includes the full `member_ids` list.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function show( \WP_REST_Request $request ) {
		$group_id = (int) $request->get_param( 'id' );
		$group    = Groups::get( $group_id );
		if ( null === $group ) {
			return self::not_found();
		}
		$group['member_ids'] = Groups::members( $group_id );
		return rest_ensure_response( $group );
	}

	/**
	 * `PATCH /admin/groups/{id}`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update( \WP_REST_Request $request ) {
		$group = Groups::update( (int) $request->get_param( 'id' ), self::group_input( $request ) );
		return is_wp_error( $group ) ? $group : rest_ensure_response( $group );
	}

	/**
	 * `DELETE /admin/groups/{id}`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete( \WP_REST_Request $request ) {
		$group_id = (int) $request->get_param( 'id' );
		$result   = Groups::delete( $group_id );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return rest_ensure_response(
			[
				'deleted' => true,
				'id'      => $group_id,
			]
		);
	}

	/**
	 * `PUT /admin/groups/{id}/members`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function set_members( \WP_REST_Request $request ) {
		$ids = $request->get_param( 'user_ids' );
		if ( ! is_array( $ids ) ) {
			return new \WP_Error(
				'imgsig_validation_failed',
				__( 'Send the members as a list of user ids.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}
		if ( count( $ids ) > Groups::MAX_MEMBERS_PER_WRITE ) {
			return new \WP_Error(
				'imgsig_validation_failed',
				__( 'Too many members in one request.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$group_id = (int) $request->get_param( 'id' );
		$result   = Groups::set_members( $group_id, $ids );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$group               = Groups::get( $group_id );
		$group               = null === $group ? [] : $group;
		$group['member_ids'] = Groups::members( $group_id );
		$group['added']      = $result['added'];
		$group['removed']    = $result['removed'];
		return rest_ensure_response( $group );
	}

	/**
	 * `GET /admin/users` — the site's users, paginated (`X-WP-Total`).
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function users( \WP_REST_Request $request ): \WP_REST_Response {
		$per_page = min( self::MAX_PER_PAGE, $this->read_int( $request, 'per_page', 20 ) );
		$page     = $this->read_int( $request, 'page', 1 );

		$args = [
			'number'      => $per_page,
			'paged'       => $page,
			'orderby'     => 'display_name',
			'order'       => 'ASC',
			'count_total' => true,
		];

		$search = $request->get_param( 'search' );
		if ( is_string( $search ) && '' !== trim( $search ) ) {
			$args['search']         = '*' . trim( $search ) . '*';
			$args['search_columns'] = [ 'user_login', 'user_email', 'user_nicename', 'display_name' ];
		}

		$role = $request->get_param( 'role' );
		if ( is_string( $role ) && '' !== $role ) {
			$args['role'] = $role;
		}

		$group = (int) $request->get_param( 'group' );
		if ( $group > 0 ) {
			$members = Groups::members( $group );
			if ( empty( $members ) ) {
				return $this->paginated_response( [], 0, $per_page );
			}
			$args['include'] = $members;
		}

		$query = new \WP_User_Query( $args );
		$users = $query->get_results();
		$users = is_array( $users ) ? $users : [];

		// One query for every listed user's groups instead of one per row.
		$memberships = Groups::for_users(
			array_map(
				static function ( $user ): int {
					return (int) $user->ID;
				},
				$users
			)
		);
		$by_id       = [];
		foreach ( Groups::all() as $group ) {
			$by_id[ (int) $group['id'] ] = $group;
		}

		$items = [];
		foreach ( $users as $user ) {
			$items[] = self::user_row( $user, $memberships[ (int) $user->ID ] ?? [], $by_id );
		}

		return $this->paginated_response( $items, (int) $query->get_total(), $per_page );
	}

	/**
	 * Public shape of a user in the directory.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_User|object                       $user      User.
	 * @param int[]|null                            $group_ids The user's group ids (null = look them up).
	 * @param array<int, array<string, mixed>>|null $by_id     Formatted groups by id (null = look them up).
	 *
	 * @return array{id: int, display_name: string, email: string, roles: string[], groups: array<int, array{id: int, name: string, color: string}>, avatar: string, can_use: bool}
	 */
	public static function user_row( $user, ?array $group_ids = null, ?array $by_id = null ): array {
		$user_id = (int) $user->ID;
		$groups  = [];
		foreach ( null === $group_ids ? Groups::for_user( $user_id ) : $group_ids as $group_id ) {
			$group = null === $by_id ? Groups::get( (int) $group_id ) : ( $by_id[ (int) $group_id ] ?? null );
			if ( null !== $group ) {
				$groups[] = [
					'id'    => $group['id'],
					'name'  => $group['name'],
					'color' => $group['color'],
				];
			}
		}

		return [
			'id'           => $user_id,
			'display_name' => (string) $user->display_name,
			'email'        => (string) $user->user_email,
			'roles'        => array_values( array_map( 'strval', isset( $user->roles ) && is_array( $user->roles ) ? $user->roles : [] ) ),
			'groups'       => $groups,
			'avatar'       => (string) get_avatar_url( $user_id, [ 'size' => 64 ] ),
			'can_use'      => user_can( $user, CapabilitiesInstaller::CAP_USE ),
		];
	}

	/**
	 * Only the group fields present in the request (partial updates).
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return array<string, mixed>
	 */
	private static function group_input( \WP_REST_Request $request ): array {
		$data = [];
		foreach ( [ 'name', 'description', 'color', 'template_id', 'compliance_footer_override' ] as $key ) {
			$value = $request->get_param( $key );
			if ( null !== $value || self::has_null_param( $request, $key ) ) {
				$data[ $key ] = $value;
			}
		}
		return $data;
	}

	/**
	 * Whether the JSON body explicitly sent `"key": null` (used to clear
	 * `template_id`).
	 *
	 * @param \WP_REST_Request $request Inbound.
	 * @param string           $key     Param.
	 *
	 * @return bool
	 */
	private static function has_null_param( \WP_REST_Request $request, string $key ): bool {
		if ( ! method_exists( $request, 'get_json_params' ) ) {
			return false;
		}
		$json = $request->get_json_params();
		return is_array( $json ) && array_key_exists( $key, $json ) && null === $json[ $key ];
	}

	/**
	 * @return \WP_Error
	 */
	private static function not_found(): \WP_Error {
		return new \WP_Error( 'imgsig_not_found', __( 'Group not found.', 'imagina-signatures' ), [ 'status' => 404 ] );
	}
}
