<?php
/**
 * Employee profile REST endpoints.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Directory\Groups;
use ImaginaSignatures\Directory\ProfileFields;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Profile fields ({@see ProfileFields}) over REST.
 *
 *   GET    /me/profile                         own profile        (imgsig_use_signatures)
 *   PATCH  /me/profile                         { values }         (imgsig_use_signatures)
 *   GET    /admin/users/{id}/profile           anyone's profile   (imgsig_manage_team)
 *   PATCH  /admin/users/{id}/profile           { values }         (imgsig_manage_team)
 *   GET    /admin/profile-fields               mapping + fields   (imgsig_manage_team)
 *   PUT    /admin/profile-fields               { mapping, custom } (imgsig_manage_team)
 *   GET    /admin/profile-fields/meta-keys     ?search=           (imgsig_manage_team)
 *
 * PATCH accepts POST / PUT too (some WAFs strip PATCH). Values of
 * fields mapped to another meta key are read-only and reported in
 * `ignored`.
 *
 * @since 1.3.0
 */
final class ProfileController extends BaseController {

	private const RL_ACTION = 'profile_update';
	private const RL_MAX    = 60;
	private const RL_WINDOW = HOUR_IN_SECONDS;

	/**
	 * @var RateLimiter|null
	 */
	private ?RateLimiter $rate_limiter;

	/**
	 * @param RateLimiter|null $rate_limiter Limits self-service writes.
	 */
	public function __construct( ?RateLimiter $rate_limiter = null ) {
		$this->rate_limiter = $rate_limiter;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_use  = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_USE );
		$require_team = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM );

		register_rest_route(
			self::NAMESPACE,
			'/me/profile',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show_own' ],
					'permission_callback' => $require_use,
				],
				[
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => [ $this, 'update_own' ],
					'permission_callback' => $require_use,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/users/(?P<id>\d+)/profile',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show_user' ],
					'permission_callback' => $require_team,
				],
				[
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => [ $this, 'update_user' ],
					'permission_callback' => $require_team,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/profile-fields',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show_fields' ],
					'permission_callback' => $require_team,
				],
				[
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => [ $this, 'update_fields' ],
					'permission_callback' => $require_team,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/profile-fields/meta-keys',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'meta_keys' ],
					'permission_callback' => $require_team,
					'args'                => [
						'search' => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						],
					],
				],
			]
		);
	}

	/**
	 * `GET /me/profile`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function show_own(): \WP_REST_Response {
		return rest_ensure_response( self::payload( get_current_user_id() ) );
	}

	/**
	 * `PATCH /me/profile`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_own( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();
		if ( null !== $this->rate_limiter ) {
			try {
				$this->rate_limiter->check( self::RL_ACTION, $user_id, self::RL_MAX, self::RL_WINDOW );
			} catch ( ImaginaSignaturesException $e ) {
				return $this->exception_to_wp_error( $e );
			}
		}
		return $this->write( $user_id, $request );
	}

	/**
	 * `GET /admin/users/{id}/profile`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function show_user( \WP_REST_Request $request ) {
		$user_id = self::site_user_id( $request );
		if ( 0 === $user_id ) {
			return self::user_not_found();
		}
		return rest_ensure_response( self::payload( $user_id ) );
	}

	/**
	 * `PATCH /admin/users/{id}/profile`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_user( \WP_REST_Request $request ) {
		$user_id = self::site_user_id( $request );
		if ( 0 === $user_id ) {
			return self::user_not_found();
		}
		return $this->write( $user_id, $request );
	}

	/**
	 * `GET /admin/profile-fields`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function show_fields(): \WP_REST_Response {
		$config = ProfileFields::config();
		return rest_ensure_response(
			[
				'config'     => $config,
				'fields'     => ProfileFields::definitions( $config ),
				'max_custom' => ProfileFields::MAX_CUSTOM,
			]
		);
	}

	/**
	 * `PUT /admin/profile-fields` — replaces the mapping + custom fields.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function update_fields( \WP_REST_Request $request ): \WP_REST_Response {
		$config = ProfileFields::save_config(
			[
				'mapping' => $request->get_param( 'mapping' ),
				'custom'  => $request->get_param( 'custom' ),
			]
		);
		return rest_ensure_response(
			[
				'config'     => $config,
				'fields'     => ProfileFields::definitions( $config ),
				'max_custom' => ProfileFields::MAX_CUSTOM,
			]
		);
	}

	/**
	 * `GET /admin/profile-fields/meta-keys`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function meta_keys( \WP_REST_Request $request ): \WP_REST_Response {
		$search = $request->get_param( 'search' );
		return rest_ensure_response(
			[ 'keys' => ProfileFields::meta_key_suggestions( is_string( $search ) ? $search : '' ) ]
		);
	}

	/**
	 * The profile payload: field definitions (with `readonly`), resolved
	 * values and the user's groups.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return array<string, mixed>
	 */
	public static function payload( int $user_id ): array {
		$fields = [];
		foreach ( ProfileFields::definitions() as $field ) {
			$field['readonly'] = ProfileFields::SOURCE_PLUGIN !== $field['source'];
			$fields[]          = $field;
		}

		$groups = [];
		foreach ( Groups::for_user( $user_id ) as $group_id ) {
			$group = Groups::get( $group_id );
			if ( null !== $group ) {
				$groups[] = [
					'id'    => $group['id'],
					'name'  => $group['name'],
					'color' => $group['color'],
				];
			}
		}

		$user = get_userdata( $user_id );

		return [
			'user_id' => $user_id,
			'user'    => [
				'display_name' => is_object( $user ) ? (string) $user->display_name : '',
				'email'        => is_object( $user ) ? (string) $user->user_email : '',
				'avatar'       => (string) get_avatar_url( $user_id, [ 'size' => 96 ] ),
			],
			'fields'  => $fields,
			'values'  => ProfileFields::values_for( $user_id ),
			'groups'  => $groups,
		];
	}

	/**
	 * Shared write path.
	 *
	 * @param int              $user_id User.
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	private function write( int $user_id, \WP_REST_Request $request ) {
		$values = $request->get_param( 'values' );
		if ( ! is_array( $values ) ) {
			return new \WP_Error(
				'imgsig_validation_failed',
				__( 'Send the profile as an object of field values.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$result           = ProfileFields::save( $user_id, $values, 'rest' );
		$payload          = self::payload( $user_id );
		$payload['saved'] = $result;
		return rest_ensure_response( $payload );
	}

	/**
	 * Id of an existing user of this site from the `id` route param, or 0.
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return int
	 */
	private static function site_user_id( \WP_REST_Request $request ): int {
		$user_id = (int) $request->get_param( 'id' );
		if ( $user_id <= 0 || ! is_object( get_userdata( $user_id ) ) ) {
			return 0;
		}
		if ( is_multisite() && ! is_user_member_of_blog( $user_id ) ) {
			return 0;
		}
		return $user_id;
	}

	/**
	 * @return \WP_Error
	 */
	private static function user_not_found(): \WP_Error {
		return new \WP_Error( 'imgsig_not_found', __( 'User not found.', 'imagina-signatures' ), [ 'status' => 404 ] );
	}
}
