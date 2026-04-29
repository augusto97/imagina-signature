<?php
/**
 * REST controller for /signatures.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Services\SignatureService;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Routes for listing, creating, updating, deleting, duplicating and
 * exporting signatures.
 *
 * All endpoints are user-scoped: the controller never trusts a user_id
 * from the request body.
 *
 * @since 1.0.0
 */
final class SignaturesController extends BaseController {

	private SignatureService $service;

	public function __construct( SignatureService $service ) {
		$this->service = $service;
	}

	/**
	 * {@inheritDoc}
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/signatures',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'index' ],
					'permission_callback' => $this->permission_for( 'imgsig_read_own_signatures' ),
				],
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'create' ],
					'permission_callback' => $this->permission_for( 'imgsig_create_signatures' ),
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/signatures/(?P<id>\\d+)',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $this->permission_for( 'imgsig_read_own_signatures' ),
				],
				[
					'methods'             => 'PATCH',
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $this->permission_for( 'imgsig_edit_own_signatures' ),
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [ $this, 'destroy' ],
					'permission_callback' => $this->permission_for( 'imgsig_delete_own_signatures' ),
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/signatures/(?P<id>\\d+)/duplicate',
			[
				'methods'             => 'POST',
				'callback'            => [ $this, 'duplicate' ],
				'permission_callback' => $this->permission_for( 'imgsig_create_signatures' ),
			]
		);
	}

	/**
	 * Lists signatures.
	 *
	 * @param \WP_REST_Request $request Request.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function index( \WP_REST_Request $request ) {
		try {
			$user_id = get_current_user_id();
			$result  = $this->service->list_for_user( $user_id, [
				'page'     => (int) ( $request->get_param( 'page' ) ?? 1 ),
				'per_page' => (int) ( $request->get_param( 'per_page' ) ?? 20 ),
				'status'   => sanitize_key( (string) ( $request->get_param( 'status' ) ?? '' ) ),
				'search'   => sanitize_text_field( (string) ( $request->get_param( 'search' ) ?? '' ) ),
				'orderby'  => sanitize_key( (string) ( $request->get_param( 'orderby' ) ?? 'updated_at' ) ),
				'order'    => sanitize_key( (string) ( $request->get_param( 'order' ) ?? 'desc' ) ),
			] );

			$response = rest_ensure_response(
				[
					'items' => array_map( static fn( $s ) => $s->to_array(), $result['items'] ),
					'total' => $result['total'],
				]
			);
			$response->header( 'X-WP-Total', (string) $result['total'] );
			return $response;
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function show( \WP_REST_Request $request ) {
		try {
			$signature = $this->service->get_for_user(
				get_current_user_id(),
				(int) $request->get_param( 'id' )
			);
			return rest_ensure_response( $signature->to_array() );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function create( \WP_REST_Request $request ) {
		try {
			$signature = $this->service->create(
				get_current_user_id(),
				[
					'name'         => $request->get_param( 'name' ),
					'json_content' => $request->get_param( 'json_content' ),
					'template_id'  => $request->get_param( 'template_id' ),
				]
			);
			return rest_ensure_response( $signature->to_array() );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function update( \WP_REST_Request $request ) {
		try {
			$signature = $this->service->update(
				get_current_user_id(),
				(int) $request->get_param( 'id' ),
				[
					'name'         => $request->get_param( 'name' ),
					'json_content' => $request->get_param( 'json_content' ),
					'status'       => $request->get_param( 'status' ),
					'html_cache'   => $request->get_param( 'html_cache' ),
					'preview_url'  => $request->get_param( 'preview_url' ),
				]
			);
			return rest_ensure_response( $signature->to_array() );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function destroy( \WP_REST_Request $request ) {
		try {
			$this->service->delete( get_current_user_id(), (int) $request->get_param( 'id' ) );
			return rest_ensure_response( [ 'deleted' => true ] );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function duplicate( \WP_REST_Request $request ) {
		try {
			$signature = $this->service->duplicate(
				get_current_user_id(),
				(int) $request->get_param( 'id' )
			);
			return rest_ensure_response( $signature->to_array() );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}
}
