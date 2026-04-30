<?php
/**
 * Templates endpoints.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Services\TemplateService;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Template endpoints (CLAUDE.md §16.2).
 *
 * Reads (`GET /templates`, `GET /templates/:id`) are open to anyone
 * who can use signatures (`imgsig_use_signatures`). Writes
 * (`POST /templates`, `PATCH /templates/:id`, `DELETE /templates/:id`)
 * are admin-only (`imgsig_manage_templates`).
 *
 * @since 1.0.0
 */
final class TemplatesController extends BaseController {

	/**
	 * @var TemplateService
	 */
	private TemplateService $service;

	/**
	 * @var TemplateRepository
	 */
	private TemplateRepository $repo;

	/**
	 * @param TemplateService    $service Template service.
	 * @param TemplateRepository $repo    Template repository.
	 */
	public function __construct( TemplateService $service, TemplateRepository $repo ) {
		$this->service = $service;
		$this->repo    = $repo;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_use    = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_USE );
		$require_manage = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES );

		register_rest_route(
			self::NAMESPACE,
			'/templates',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'index' ],
					'permission_callback' => $require_use,
					'args'                => $this->index_args(),
				],
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'create' ],
					'permission_callback' => $require_manage,
					'args'                => $this->write_args( true ),
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/templates/(?P<id>\d+)',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $require_use,
				],
				[
					'methods'             => 'PATCH',
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $require_manage,
					'args'                => $this->write_args( false ),
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [ $this, 'delete' ],
					'permission_callback' => $require_manage,
				],
			]
		);
	}

	/**
	 * `GET /templates`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function index( \WP_REST_Request $request ): \WP_REST_Response {
		$args = [
			'category' => $request->get_param( 'category' ),
			'page'     => $this->read_int( $request, 'page', 1 ),
			'per_page' => $this->read_int( $request, 'per_page', 50 ),
			'order_by' => $request->get_param( 'order_by' ),
			'order'    => $request->get_param( 'order' ),
		];

		$items = $this->repo->list( $args );
		$total = $this->repo->count( $args );

		$payload = [];
		foreach ( $items as $template ) {
			$payload[] = $template->to_array();
		}

		return $this->paginated_response( $payload, $total, (int) $args['per_page'] );
	}

	/**
	 * `GET /templates/:id`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function show( \WP_REST_Request $request ) {
		$template = $this->repo->find( (int) $request['id'] );
		if ( null === $template ) {
			return new \WP_Error(
				'imgsig_not_found',
				__( 'Template not found.', 'imagina-signatures' ),
				[ 'status' => 404 ]
			);
		}
		return rest_ensure_response( $template->to_array() );
	}

	/**
	 * `POST /templates`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function create( \WP_REST_Request $request ) {
		try {
			$template = $this->service->create( $this->read_payload( $request ) );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$response = rest_ensure_response( $template->to_array() );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * `PATCH /templates/:id`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update( \WP_REST_Request $request ) {
		try {
			$template = $this->service->update( (int) $request['id'], $this->read_payload( $request ) );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}
		return rest_ensure_response( $template->to_array() );
	}

	/**
	 * `DELETE /templates/:id`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete( \WP_REST_Request $request ) {
		try {
			$this->service->delete( (int) $request['id'] );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}
		return rest_ensure_response( [ 'deleted' => true ] );
	}

	/**
	 * Reads the writable subset of fields from the request body.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return array<string, mixed>
	 */
	private function read_payload( \WP_REST_Request $request ): array {
		$payload = [];

		foreach ( [ 'slug', 'name', 'category', 'description', 'preview_url', 'json_content', 'sort_order' ] as $field ) {
			if ( null !== $request->get_param( $field ) ) {
				$payload[ $field ] = $request->get_param( $field );
			}
		}

		return $payload;
	}

	/**
	 * REST `args` for the list endpoint.
	 *
	 * @since 1.0.0
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function index_args(): array {
		return [
			'category' => [
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			],
			'page'     => [
				'type'    => 'integer',
				'minimum' => 1,
				'default' => 1,
			],
			'per_page' => [
				'type'    => 'integer',
				'minimum' => 1,
				'maximum' => 100,
				'default' => 50,
			],
			'order_by' => [
				'type' => 'string',
				'enum' => [ 'sort_order', 'created_at', 'name' ],
			],
			'order'    => [
				'type' => 'string',
				'enum' => [ 'asc', 'desc' ],
			],
		];
	}

	/**
	 * REST `args` for create / update.
	 *
	 * @since 1.0.0
	 *
	 * @param bool $is_create Whether name + slug are required.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function write_args( bool $is_create ): array {
		return [
			'slug'         => [
				'type'              => 'string',
				'required'          => $is_create,
				'sanitize_callback' => 'sanitize_title',
			],
			'name'         => [
				'type'              => 'string',
				'required'          => $is_create,
				'sanitize_callback' => 'sanitize_text_field',
			],
			'category'     => [
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			],
			'description'  => [
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_textarea_field',
			],
			'preview_url'  => [
				'type'              => 'string',
				'sanitize_callback' => 'esc_url_raw',
			],
			'sort_order'   => [
				'type' => 'integer',
			],
			'json_content' => [
				'type' => 'object',
			],
		];
	}
}
