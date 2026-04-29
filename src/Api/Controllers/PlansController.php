<?php
/**
 * REST controller for /admin/plans.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Models\PlanLimits;
use ImaginaSignatures\Repositories\PlanRepository;
use ImaginaSignatures\Services\PlanService;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class PlansController extends BaseController {

	private PlanService $service;
	private PlanRepository $repo;

	public function __construct( PlanService $service, PlanRepository $repo ) {
		$this->service = $service;
		$this->repo    = $repo;
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/admin/plans',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'index' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_plans' ),
				],
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'create' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_plans' ),
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/plans/(?P<id>\\d+)',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_plans' ),
				],
				[
					'methods'             => 'PATCH',
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_plans' ),
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [ $this, 'destroy' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_plans' ),
				],
			]
		);
	}

	public function index( \WP_REST_Request $request ) {
		$include_inactive = (bool) $request->get_param( 'include_inactive' );
		$plans            = $this->service->list_plans( $include_inactive );
		return rest_ensure_response(
			[
				'items' => array_map( static fn( $p ) => $p->to_array(), $plans ),
			]
		);
	}

	public function show( \WP_REST_Request $request ) {
		$plan = $this->repo->find( (int) $request->get_param( 'id' ) );
		if ( null === $plan ) {
			return new \WP_Error( 'imgsig_not_found', '', [ 'status' => 404 ] );
		}
		return rest_ensure_response( $plan->to_array() );
	}

	public function create( \WP_REST_Request $request ) {
		try {
			$plan = $this->service->save( $this->extract( $request ) );
			return rest_ensure_response( $plan->to_array() );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function update( \WP_REST_Request $request ) {
		try {
			$plan = $this->service->save(
				array_merge(
					$this->extract( $request ),
					[ 'id' => (int) $request->get_param( 'id' ) ]
				)
			);
			return rest_ensure_response( $plan->to_array() );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function destroy( \WP_REST_Request $request ) {
		$this->repo->delete( (int) $request->get_param( 'id' ) );
		return rest_ensure_response( [ 'deleted' => true ] );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 *
	 * @return array<string, mixed>
	 */
	private function extract( \WP_REST_Request $request ): array {
		$limits = is_array( $request->get_param( 'limits' ) ) ? $request->get_param( 'limits' ) : [];
		return [
			'slug'        => sanitize_key( (string) ( $request->get_param( 'slug' ) ?? '' ) ),
			'name'        => sanitize_text_field( (string) ( $request->get_param( 'name' ) ?? '' ) ),
			'description' => sanitize_text_field( (string) ( $request->get_param( 'description' ) ?? '' ) ),
			'limits'      => PlanLimits::from_array( $limits ),
			'is_default'  => (bool) $request->get_param( 'is_default' ),
			'is_active'   => null === $request->get_param( 'is_active' ) ? true : (bool) $request->get_param( 'is_active' ),
			'sort_order'  => (int) ( $request->get_param( 'sort_order' ) ?? 0 ),
		];
	}
}
