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
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Services\TemplateAssignmentService;
use ImaginaSignatures\Services\TemplatePropagator;
use ImaginaSignatures\Services\TemplateService;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Setup\DefaultTemplatesSeeder;

defined( 'ABSPATH' ) || exit;

/**
 * Template endpoints (CLAUDE.md §16.2).
 *
 * Reads (`GET /templates`, `GET /templates/:id`) are open to anyone
 * who can use signatures (`imgsig_use_signatures`). Writes
 * (`POST /templates`, `PATCH /templates/:id`, `DELETE /templates/:id`)
 * are admin-only (`imgsig_manage_templates`).
 *
 * 1.3.0 (linked signatures):
 *  - `PATCH /templates/:id` with a new `json_content` propagates the
 *    design to every signature linked to the template (synchronously up
 *    to 100, else WP-Cron batches) and returns `propagation` progress.
 *  - `GET  /admin/templates/:id/propagation` — that progress.
 *  - `POST /admin/templates/:id/assign` — creates / updates each target
 *    user's signature from the template, 50 users per request
 *    ({@see TemplateAssignmentService}).
 *  - `POST /admin/templates/:id/apply` (1.1.0 bulk apply) delegates to
 *    the assignment service in `copy` mode.
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
	 * @var TemplateAssignmentService
	 */
	private TemplateAssignmentService $assignment;

	/**
	 * @var TemplatePropagator
	 */
	private TemplatePropagator $propagator;

	/**
	 * @param TemplateService                $service           Template service.
	 * @param TemplateRepository             $repo              Template repository.
	 * @param SignatureService               $signature_service Signature service.
	 * @param SignatureRepository            $signature_repo    Signature repository.
	 * @param TemplateAssignmentService|null $assignment        Assignment service (built from the above when null).
	 * @param TemplatePropagator|null        $propagator        Propagator (built from the above when null).
	 */
	public function __construct(
		TemplateService $service,
		TemplateRepository $repo,
		SignatureService $signature_service,
		SignatureRepository $signature_repo,
		?TemplateAssignmentService $assignment = null,
		?TemplatePropagator $propagator = null
	) {
		$this->service           = $service;
		$this->repo              = $repo;
		$this->signature_service = $signature_service;
		$this->signature_repo    = $signature_repo;
		$this->assignment        = $assignment ?? new TemplateAssignmentService( $signature_service, $signature_repo );
		$this->propagator        = $propagator ?? new TemplatePropagator( $signature_repo, $repo );
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

		register_rest_route(
			self::NAMESPACE,
			'/admin/templates/(?P<id>\d+)/assign',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'assign' ],
					'permission_callback' => CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM ),
					'args'                => [
						'user_ids'     => [
							'type'  => 'array',
							'items' => [ 'type' => 'integer' ],
						],
						'group_ids'    => [
							'type'  => 'array',
							'items' => [ 'type' => 'integer' ],
						],
						'role'         => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_key',
						],
						// Every user who can use signatures.
						'all'          => [
							'type'    => 'boolean',
							'default' => false,
						],
						'mode'         => [
							'type'    => 'string',
							'enum'    => [ TemplateAssignmentService::MODE_LINKED, TemplateAssignmentService::MODE_COPY ],
							'default' => TemplateAssignmentService::MODE_LINKED,
						],
						'make_primary' => [
							'type'    => 'boolean',
							'default' => false,
						],
						'offset'       => [
							'type'    => 'integer',
							'minimum' => 0,
							'default' => 0,
						],
					],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/templates/(?P<id>\d+)/propagation',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'propagation' ],
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
			$payload[] = DefaultTemplatesSeeder::localize( $template->to_array() );
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

		// Same visibility rule as index(): a template scoped to roles
		// the caller doesn't hold answers 404 (not 403) so ids can't be
		// probed for existence.
		if ( null === $template || ! self::is_visible_to_current_user( $template->visible_to_roles ) ) {
			return new \WP_Error(
				'imgsig_not_found',
				__( 'Template not found.', 'imagina-signatures' ),
				[ 'status' => 404 ]
			);
		}
		return rest_ensure_response( DefaultTemplatesSeeder::localize( $template->to_array() ) );
	}

	/**
	 * Mirrors the `visible_to_roles` filter that {@see index()} applies
	 * in SQL: template managers see everything; everyone else sees
	 * templates with no role scoping or scoped to one of their roles.
	 *
	 * @since 1.0.40
	 *
	 * @param array<int, string> $visible_to_roles Template role scope (empty = everyone).
	 *
	 * @return bool
	 */
	public static function is_visible_to_current_user( array $visible_to_roles ): bool {
		if ( empty( $visible_to_roles ) || current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ) ) {
			return true;
		}

		return [] !== array_intersect( array_map( 'sanitize_key', $visible_to_roles ), self::current_user_roles() );
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

		$response = rest_ensure_response( $this->with_notes( DefaultTemplatesSeeder::localize( $template->to_array() ) ) );
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
		$payload = $this->read_payload( $request );
		try {
			$template = $this->service->update( (int) $request['id'], $payload );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$response = $this->with_notes( DefaultTemplatesSeeder::localize( $template->to_array() ) );

		// A new design reaches every signature linked to the template
		// (1.3.0). Metadata-only edits (name, roles…) don't touch them.
		if ( array_key_exists( 'json_content', $payload ) ) {
			$response['propagation'] = $this->propagator->propagate( $template->id );
		}

		return rest_ensure_response( $response );
	}

	/**
	 * `GET /admin/templates/:id/propagation` — progress of the last
	 * propagation of this template to its linked signatures.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function propagation( \WP_REST_Request $request ): \WP_REST_Response {
		$template_id = (int) $request['id'];
		$progress    = $this->propagator->progress( $template_id );

		return rest_ensure_response(
			$progress ?? [
				'template_id' => $template_id,
				'status'      => 'none',
				'total'       => $this->signature_repo->count_linked_to_template( $template_id ),
				'processed'   => 0,
				'updated'     => 0,
			]
		);
	}

	/**
	 * `POST /admin/templates/:id/assign` — one chunk (≤ 50 users) of a
	 * template assignment. The client repeats the call with
	 * `offset = next_offset` until it is null.
	 *
	 * Body: `{ user_ids?: int[], group_ids?: int[], role?: string,
	 * all?: bool, mode: 'linked'|'copy', make_primary: bool, offset?: int }`.
	 * Response: `{ template_id, processed, created, updated, skipped,
	 * failed, total, next_offset }`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function assign( \WP_REST_Request $request ) {
		$template = $this->repo->find( (int) $request['id'] );
		if ( null === $template ) {
			return new \WP_Error(
				'imgsig_not_found',
				__( 'Template not found.', 'imagina-signatures' ),
				[ 'status' => 404 ]
			);
		}

		try {
			$result = $this->assignment->assign(
				$template,
				[
					'user_ids'     => (array) ( $request->get_param( 'user_ids' ) ?? [] ),
					'group_ids'    => (array) ( $request->get_param( 'group_ids' ) ?? [] ),
					'role'         => (string) ( $request->get_param( 'role' ) ?? '' ),
					'all'          => (bool) $request->get_param( 'all' ),
					'mode'         => (string) ( $request->get_param( 'mode' ) ?? TemplateAssignmentService::MODE_LINKED ),
					'make_primary' => (bool) $request->get_param( 'make_primary' ),
					'offset'       => max( 0, (int) $request->get_param( 'offset' ) ),
				]
			);
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		return rest_ensure_response( [ 'template_id' => $template->id ] + $result );
	}

	/**
	 * Appends sanitisation notes (additive; only when non-empty).
	 *
	 * @since 1.0.40
	 *
	 * @param array<string, mixed> $payload Serialised template.
	 *
	 * @return array<string, mixed>
	 */
	private function with_notes( array $payload ): array {
		$notes = $this->service->last_sanitization_notes();
		if ( ! empty( $notes ) ) {
			$payload['sanitization_notes'] = $notes;
		}
		return $payload;
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

		if ( ! is_array( json_decode( $template->json_content, true ) ) ) {
			return new \WP_Error(
				'imgsig_template_corrupt',
				__( 'This template has invalid json_content; bulk apply aborted.', 'imagina-signatures' ),
				[ 'status' => 422 ]
			);
		}

		$targets = self::scope_to_targets( $scope );
		$totals  = [
			'targeted' => 0,
			'created'  => 0,
			'skipped'  => 0,
			'failed'   => 0,
		];

		// 1.3.0: delegates to the assignment service (detached copies),
		// walking every chunk in this one request as before.
		$offset = 0;
		do {
			try {
				$chunk = null === $targets ? null : $this->assignment->assign(
					$template,
					$targets + [
						'mode'          => TemplateAssignmentService::MODE_COPY,
						'always_create' => ! $skip_existing,
						'offset'        => $offset,
					]
				);
			} catch ( ValidationException $e ) {
				$chunk = null;
			}

			if ( null === $chunk ) {
				return new \WP_Error(
					'imgsig_scope_empty',
					__( 'No users matched the supplied scope.', 'imagina-signatures' ),
					[ 'status' => 400 ]
				);
			}

			$totals['targeted'] = $chunk['total'];
			$totals['created'] += $chunk['created'];
			$totals['skipped'] += $chunk['skipped'];
			$totals['failed']  += $chunk['failed'];
			$offset             = $chunk['next_offset'];
		} while ( null !== $offset );

		do_action( 'imgsig/template/bulk_applied', $template->id, $scope, $totals['created'], $totals['skipped'], $totals['failed'] );

		return rest_ensure_response(
			[
				'template_id' => $template->id,
				'scope'       => $scope,
				'targeted'    => $totals['targeted'],
				'created'     => $totals['created'],
				'skipped'     => $totals['skipped'],
				'failed'      => $totals['failed'],
			]
		);
	}

	/**
	 * Turns a bulk-apply scope string into assignment targets.
	 *
	 * @since 1.3.0
	 *
	 * @param string $scope `all`, `role:slug`, or `users:1,2,3`.
	 *
	 * @return array<string, mixed>|null Null for an unparseable scope.
	 */
	private static function scope_to_targets( string $scope ): ?array {
		if ( 'all' === $scope ) {
			return [ 'all' => true ];
		}

		if ( 0 === strpos( $scope, 'role:' ) ) {
			$role = sanitize_key( substr( $scope, 5 ) );
			return '' === $role ? null : [ 'role' => $role ];
		}

		if ( 0 === strpos( $scope, 'users:' ) ) {
			$ids = array_values( array_filter( array_map( 'intval', explode( ',', substr( $scope, 6 ) ) ) ) );
			return [] === $ids ? null : [ 'user_ids' => $ids ];
		}

		return null;
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
