<?php
/**
 * REST controller for /admin/users.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Repositories\PlanRepository;
use ImaginaSignatures\Repositories\UsageRepository;
use ImaginaSignatures\Repositories\UserPlanRepository;
use ImaginaSignatures\Services\PlanService;
use ImaginaSignatures\Setup\RolesInstaller;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Admin endpoints for managing imgsig users.
 *
 * @since 1.0.0
 */
final class UsersController extends BaseController {

	private PlanService $plans;
	private PlanRepository $plan_repo;
	private UserPlanRepository $user_plans;
	private UsageRepository $usage;

	public function __construct(
		PlanService $plans,
		PlanRepository $plan_repo,
		UserPlanRepository $user_plans,
		UsageRepository $usage
	) {
		$this->plans      = $plans;
		$this->plan_repo  = $plan_repo;
		$this->user_plans = $user_plans;
		$this->usage      = $usage;
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/admin/users',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'index' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_users' ),
				],
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'create' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_users' ),
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/users/(?P<id>\\d+)/plan',
			[
				'methods'             => 'PATCH',
				'callback'            => [ $this, 'change_plan' ],
				'permission_callback' => $this->permission_for( 'imgsig_manage_users' ),
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/users/(?P<id>\\d+)',
			[
				'methods'             => 'DELETE',
				'callback'            => [ $this, 'destroy' ],
				'permission_callback' => $this->permission_for( 'imgsig_manage_users' ),
			]
		);
	}

	public function index( \WP_REST_Request $request ) {
		$args = [
			'role'    => RolesInstaller::role_slug(),
			'number'  => max( 1, min( 100, (int) ( $request->get_param( 'per_page' ) ?? 20 ) ) ),
			'paged'   => max( 1, (int) ( $request->get_param( 'page' ) ?? 1 ) ),
			'search'  => '*' . esc_attr( (string) ( $request->get_param( 'search' ) ?? '' ) ) . '*',
			'orderby' => 'display_name',
			'order'   => 'ASC',
		];
		$query = new \WP_User_Query( $args );

		$items = [];
		foreach ( $query->get_results() as $user ) {
			$assignment = $this->user_plans->find_for_user( (int) $user->ID );
			$plan       = $assignment !== null ? $this->plan_repo->find( $assignment->plan_id ) : null;
			$usage      = $this->usage->get_for_user( (int) $user->ID );

			$items[] = [
				'id'           => (int) $user->ID,
				'display_name' => $user->display_name,
				'email'        => $user->user_email,
				'plan'         => $plan !== null ? $plan->to_array() : null,
				'usage'        => $usage->to_array(),
			];
		}

		return rest_ensure_response(
			[
				'items' => $items,
				'total' => (int) $query->get_total(),
			]
		);
	}

	public function create( \WP_REST_Request $request ) {
		$email = sanitize_email( (string) $request->get_param( 'email' ) );
		$name  = sanitize_text_field( (string) $request->get_param( 'name' ) );
		$plan  = (int) $request->get_param( 'plan_id' );
		$send  = (bool) $request->get_param( 'send_email' );

		if ( '' === $email || ! is_email( $email ) ) {
			return new \WP_Error( 'imgsig_invalid_email', '', [ 'status' => 400 ] );
		}

		$existing = get_user_by( 'email', $email );
		if ( $existing instanceof \WP_User ) {
			$user_id = (int) $existing->ID;
			$existing->add_role( RolesInstaller::role_slug() );
		} else {
			$password = wp_generate_password( 16, true, true );
			$user_id  = wp_insert_user(
				[
					'user_login'   => $email,
					'user_email'   => $email,
					'user_pass'    => $password,
					'display_name' => $name,
					'role'         => RolesInstaller::role_slug(),
				]
			);
			if ( is_wp_error( $user_id ) ) {
				return $user_id;
			}

			if ( $send ) {
				wp_new_user_notification( (int) $user_id, null, 'user' );
			}
		}

		if ( $plan > 0 ) {
			$this->plans->assign_to_user( (int) $user_id, $plan );
		}

		return rest_ensure_response( [ 'user_id' => (int) $user_id ] );
	}

	public function change_plan( \WP_REST_Request $request ) {
		$user_id = (int) $request->get_param( 'id' );
		$plan_id = (int) $request->get_param( 'plan_id' );
		$this->plans->assign_to_user( $user_id, $plan_id );
		return rest_ensure_response( [ 'ok' => true ] );
	}

	public function destroy( \WP_REST_Request $request ) {
		$user_id = (int) $request->get_param( 'id' );
		$user    = get_user_by( 'id', $user_id );
		if ( ! $user instanceof \WP_User ) {
			return new \WP_Error( 'imgsig_not_found', '', [ 'status' => 404 ] );
		}
		$user->remove_role( RolesInstaller::role_slug() );
		$this->plans->detach_from_user( $user_id );
		return rest_ensure_response( [ 'ok' => true ] );
	}
}
