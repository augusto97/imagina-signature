<?php
/**
 * REST controller for /templates.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Services\QuotaEnforcer;
use ImaginaSignatures\Services\TemplateService;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class TemplatesController extends BaseController {

	private TemplateService $service;
	private QuotaEnforcer $quota;

	public function __construct( TemplateService $service, QuotaEnforcer $quota ) {
		$this->service = $service;
		$this->quota   = $quota;
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/templates',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'index' ],
					'permission_callback' => $this->permission_for( 'imgsig_read_own_signatures' ),
				],
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'create' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_templates' ),
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/templates/(?P<id>\\d+)',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $this->permission_for( 'imgsig_read_own_signatures' ),
				],
				[
					'methods'             => 'PATCH',
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_templates' ),
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [ $this, 'destroy' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_templates' ),
				],
			]
		);
	}

	public function index( \WP_REST_Request $request ) {
		try {
			$plan      = $this->quota->plan_for_user( get_current_user_id() );
			$category  = sanitize_key( (string) ( $request->get_param( 'category' ) ?? '' ) );
			$templates = $this->service->list_templates( [ 'category' => $category ] );

			if ( ! $plan->limits->allow_premium_templates ) {
				$templates = array_values(
					array_filter( $templates, static fn( $t ) => ! $t->is_premium )
				);
			}

			return rest_ensure_response(
				[
					'items' => array_map( static fn( $t ) => $t->to_array(), $templates ),
				]
			);
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function show( \WP_REST_Request $request ) {
		$template = $this->service->get( (int) $request->get_param( 'id' ) );
		if ( null === $template ) {
			return new \WP_Error( 'imgsig_not_found', __( 'Template not found.', 'imagina-signatures' ), [ 'status' => 404 ] );
		}
		return rest_ensure_response( $template->to_array() );
	}

	public function create( \WP_REST_Request $request ) {
		try {
			$template = $this->service->save( $this->extract_template_data( $request ) );
			return rest_ensure_response( $template->to_array() );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function update( \WP_REST_Request $request ) {
		try {
			$template = $this->service->save(
				array_merge(
					$this->extract_template_data( $request ),
					[ 'id' => (int) $request->get_param( 'id' ) ]
				)
			);
			return rest_ensure_response( $template->to_array() );
		} catch ( \Throwable $e ) {
			return $this->exception_to_wp_error( $e );
		}
	}

	public function destroy( \WP_REST_Request $request ) {
		$this->service->save(
			[
				'id' => (int) $request->get_param( 'id' ),
			]
		);
		return rest_ensure_response( [ 'deleted' => true ] );
	}

	/**
	 * Extracts the template fields from a request.
	 *
	 * @param \WP_REST_Request $request Request.
	 *
	 * @return array<string, mixed>
	 */
	private function extract_template_data( \WP_REST_Request $request ): array {
		return [
			'slug'         => sanitize_key( (string) ( $request->get_param( 'slug' ) ?? '' ) ),
			'name'         => sanitize_text_field( (string) ( $request->get_param( 'name' ) ?? '' ) ),
			'category'     => sanitize_key( (string) ( $request->get_param( 'category' ) ?? 'general' ) ),
			'description'  => sanitize_text_field( (string) ( $request->get_param( 'description' ) ?? '' ) ),
			'preview_url'  => esc_url_raw( (string) ( $request->get_param( 'preview_url' ) ?? '' ) ),
			'json_content' => $request->get_param( 'json_content' ),
			'is_premium'   => (bool) $request->get_param( 'is_premium' ),
			'is_system'    => false,
			'sort_order'   => (int) ( $request->get_param( 'sort_order' ) ?? 0 ),
		];
	}
}
