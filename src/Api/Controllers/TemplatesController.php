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
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Services\SignatureService;
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
	 * @var SignatureService
	 */
	private SignatureService $signature_service;

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $signature_repo;

	/**
	 * @param TemplateService     $service           Template service.
	 * @param TemplateRepository  $repo              Template repository.
	 * @param SignatureService    $signature_service Signature service (for bulk-apply).
	 * @param SignatureRepository $signature_repo    Signature repository (for dedupe).
	 */
	public function __construct(
		TemplateService $service,
		TemplateRepository $repo,
		SignatureService $signature_service,
		SignatureRepository $signature_repo
	) {
		$this->service           = $service;
		$this->repo              = $repo;
		$this->signature_service = $signature_service;
		$this->signature_repo    = $signature_repo;
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
					// `EDITABLE` = POST | PUT | PATCH — defends against
					// hosting WAFs that strip PATCH at the proxy layer.
					'methods'             => \WP_REST_Server::EDITABLE,
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

		register_rest_route(
			self::NAMESPACE,
			'/admin/templates/(?P<id>\d+)/apply',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'bulk_apply' ],
					'permission_callback' => $require_manage,
					'args'                => [
						'scope' => [
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => 'sanitize_text_field',
						],
						'skip_existing' => [
							'type'    => 'boolean',
							'default' => true,
						],
					],
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

		// Visibility filter: admins (manage_templates) see every template
		// regardless of role scoping; everyone else only sees templates
		// whose `visible_to_roles` is empty OR overlaps with their roles.
		if ( ! current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ) ) {
			$args['visible_to_roles'] = self::current_user_roles();
		}

		$items = $this->repo->list( $args );
		$total = $this->repo->count( $args );

		$payload = [];
		foreach ( $items as $template ) {
			$payload[] = $template->to_array();
		}

		return $this->paginated_response( $payload, $total, (int) $args['per_page'] );
	}

	/**
	 * Resolves the role slugs of the currently logged-in user.
	 *
	 * @since 1.1.0
	 *
	 * @return array<int, string>
	 */
	private static function current_user_roles(): array {
		$user = wp_get_current_user();
		return is_object( $user ) && isset( $user->roles ) && is_array( $user->roles )
			? array_values( array_filter( array_map( 'sanitize_key', $user->roles ) ) )
			: [];
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
	 * `POST /admin/templates/:id/apply` — bulk apply.
	 *
	 * Creates a new signature for each user in scope, seeded with the
	 * template's `json_content`. Existing signatures are preserved
	 * (the new row is added alongside, not in place of, the user's
	 * current signatures).
	 *
	 * Scopes:
	 *  - `all`              — every user with `imgsig_use_signatures`.
	 *  - `role:editor`      — users in the named WP role.
	 *  - `users:1,2,3`      — explicit user-id list.
	 *
	 * `skip_existing` (default true) suppresses creating a duplicate
	 * row for any user that already has a signature with this
	 * template_id — re-running the same apply doesn't multiply rows.
	 *
	 * @since 1.1.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function bulk_apply( \WP_REST_Request $request ) {
		$template = $this->repo->find( (int) $request['id'] );
		if ( null === $template ) {
			return new \WP_Error(
				'imgsig_not_found',
				__( 'Template not found.', 'imagina-signatures' ),
				[ 'status' => 404 ]
			);
		}

		$scope         = (string) $request->get_param( 'scope' );
		$skip_existing = (bool) $request->get_param( 'skip_existing' );

		$user_ids = self::resolve_scope( $scope );
		if ( empty( $user_ids ) ) {
			return new \WP_Error(
				'imgsig_scope_empty',
				__( 'No users matched the supplied scope.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$created = 0;
		$skipped = 0;
		$failed  = 0;

		$json_content = json_decode( $template->json_content, true );
		if ( ! is_array( $json_content ) ) {
			return new \WP_Error(
				'imgsig_template_corrupt',
				__( 'This template has invalid json_content; bulk apply aborted.', 'imagina-signatures' ),
				[ 'status' => 422 ]
			);
		}

		foreach ( $user_ids as $user_id ) {
			if ( $skip_existing && $this->signature_repo->user_has_signature_from_template( $user_id, $template->id ) ) {
				++$skipped;
				continue;
			}

			try {
				$this->signature_service->create(
					$user_id,
					[
						'name'         => $template->name,
						'json_content' => $json_content,
						'template_id'  => $template->id,
					]
				);
				++$created;
			} catch ( ImaginaSignaturesException $e ) {
				++$failed;
			}
		}

		do_action( 'imgsig/template/bulk_applied', $template->id, $scope, $created, $skipped, $failed );

		return rest_ensure_response(
			[
				'template_id' => $template->id,
				'scope'       => $scope,
				'targeted'    => count( $user_ids ),
				'created'     => $created,
				'skipped'     => $skipped,
				'failed'      => $failed,
			]
		);
	}

	/**
	 * Resolves a scope string into a deduped array of user ids.
	 *
	 * @since 1.1.0
	 *
	 * @param string $scope `all`, `role:slug`, or `users:1,2,3`.
	 *
	 * @return int[]
	 */
	private static function resolve_scope( string $scope ): array {
		if ( 'all' === $scope ) {
			$users = get_users(
				[
					'capability' => CapabilitiesInstaller::CAP_USE,
					'fields'     => 'ID',
				]
			);
			return array_map( 'intval', (array) $users );
		}

		if ( 0 === strpos( $scope, 'role:' ) ) {
			$role  = sanitize_key( substr( $scope, 5 ) );
			if ( '' === $role ) {
				return [];
			}
			$users = get_users(
				[
					'role'   => $role,
					'fields' => 'ID',
				]
			);
			$ids = array_map( 'intval', (array) $users );
			// Filter to users who actually hold the cap (a role
			// without `imgsig_use_signatures` shouldn't get rows).
			return array_values(
				array_filter(
					$ids,
					static function ( int $id ): bool {
						return user_can( $id, CapabilitiesInstaller::CAP_USE );
					}
				)
			);
		}

		if ( 0 === strpos( $scope, 'users:' ) ) {
			$ids = array_filter(
				array_map( 'intval', explode( ',', substr( $scope, 6 ) ) )
			);
			return array_values(
				array_unique(
					array_filter(
						$ids,
						static function ( int $id ): bool {
							return user_can( $id, CapabilitiesInstaller::CAP_USE );
						}
					)
				)
			);
		}

		return [];
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

		// Roles arrive as an array of slug strings; the service /
		// repository sanitise individual entries with sanitize_key.
		if ( null !== $request->get_param( 'visible_to_roles' ) ) {
			$payload['visible_to_roles'] = (array) $request->get_param( 'visible_to_roles' );
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
			'visible_to_roles' => [
				'type'  => 'array',
				'items' => [ 'type' => 'string' ],
			],
		];
	}
}
