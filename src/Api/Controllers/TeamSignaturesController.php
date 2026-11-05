<?php
/**
 * Team console: recompiling other users' signatures.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Settings\SystemVariables;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Endpoints the team console uses so an administrator's browser — the
 * only compiler — can recompile signatures whose stored HTML is stale
 * (a template update propagated to them, or they were never compiled).
 * All routes require `imgsig_manage_team`.
 *
 *  - `GET  /admin/signatures/stale`
 *        `?page&per_page` (≤ 100) `&template_id&after_id&include_archived`
 *        → `[ { id, user_id, name, template_id, link_mode, status,
 *          updated_at, compiled_at } ]` + `X-WP-Total` / `X-WP-TotalPages`.
 *        Rows leave the list as they are recompiled: walk it with
 *        `after_id` (the last id seen), not with growing pages.
 *  - `GET  /admin/signatures/:id/render-context`
 *        → `{ id, user_id, name, template_id, link_mode, updated_at,
 *          compiled_at, locale, json_content, systemVariables,
 *          complianceFooter, bannerCampaigns }` — `systemVariables` are
 *          the TARGET user's (not the administrator's).
 *  - `POST /admin/signatures/:id/html` `{ html, text?, expected_updated_at? }`
 *        → `{ id, user_id, compiled_at, updated_at, html_stale }`. With
 *          `expected_updated_at` (the render context's `updated_at`), a
 *          signature edited in between answers 409 instead of storing
 *          HTML compiled from an older design.
 *
 * @since 1.3.0
 */
final class TeamSignaturesController extends BaseController {

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $repo;

	/**
	 * @var SignatureService
	 */
	private SignatureService $service;

	/**
	 * @param SignatureRepository $repo    Signature repository.
	 * @param SignatureService    $service Signature service.
	 */
	public function __construct( SignatureRepository $repo, SignatureService $service ) {
		$this->repo    = $repo;
		$this->service = $service;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_team = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM );

		register_rest_route(
			self::NAMESPACE,
			'/admin/signatures/stale',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'stale' ],
					'permission_callback' => $require_team,
					'args'                => [
						'page'             => [
							'type'    => 'integer',
							'minimum' => 1,
							'default' => 1,
						],
						'per_page'         => [
							'type'    => 'integer',
							'minimum' => 1,
							'maximum' => 100,
							'default' => 20,
						],
						'template_id'      => [
							'type'    => 'integer',
							'minimum' => 1,
						],
						'after_id'         => [
							'type'    => 'integer',
							'minimum' => 0,
						],
						'include_archived' => [
							'type'    => 'boolean',
							'default' => false,
						],
					],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/signatures/(?P<id>\d+)/render-context',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'render_context' ],
					'permission_callback' => $require_team,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/signatures/(?P<id>\d+)/html',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'store_html' ],
					'permission_callback' => $require_team,
					'args'                => [
						'html'                => [
							'type'     => 'string',
							'required' => true,
						],
						'text'                => [
							'type' => 'string',
						],
						'expected_updated_at' => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						],
					],
				],
			]
		);
	}

	/**
	 * `GET /admin/signatures/stale`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function stale( \WP_REST_Request $request ): \WP_REST_Response {
		$args = [
			'page'             => $this->read_int( $request, 'page', 1 ),
			'per_page'         => min( 100, $this->read_int( $request, 'per_page', 20 ) ),
			'template_id'      => $this->read_int( $request, 'template_id', 0 ),
			'after_id'         => $this->read_int( $request, 'after_id', 0 ),
			'include_archived' => (bool) $request->get_param( 'include_archived' ),
		];

		$items = [];
		foreach ( $this->repo->find_stale( $args ) as $signature ) {
			$items[] = [
				'id'          => $signature->id,
				'user_id'     => $signature->user_id,
				'name'        => $signature->name,
				'template_id' => $signature->template_id,
				'link_mode'   => $signature->link_mode,
				'status'      => $signature->status,
				'updated_at'  => $signature->updated_at,
				'compiled_at' => $signature->compiled_at,
			];
		}

		return $this->paginated_response( $items, $this->repo->count_stale( $args ), $args['per_page'] );
	}

	/**
	 * `GET /admin/signatures/:id/render-context` — everything the
	 * browser compiler needs to rebuild the signature exactly as its
	 * owner's editor would.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function render_context( \WP_REST_Request $request ) {
		$signature = $this->repo->find( (int) $request['id'] );
		$owner     = null !== $signature ? get_userdata( $signature->user_id ) : false;
		if ( null === $signature || ! $owner instanceof \WP_User ) {
			return $this->not_found();
		}

		$site    = SiteSettingsController::current_settings();
		$payload = $signature->to_array();

		return rest_ensure_response(
			[
				'id'               => $signature->id,
				'user_id'          => $signature->user_id,
				'name'             => $signature->name,
				'template_id'      => $signature->template_id,
				'link_mode'        => $signature->link_mode,
				'updated_at'       => $signature->updated_at,
				'compiled_at'      => $signature->compiled_at,
				'locale'           => get_user_locale( $owner->ID ),
				'json_content'     => $payload['json_content'],
				// The owner's wp_* / company_* / profile values — never the
				// administrator's own.
				'systemVariables'  => SystemVariables::for_user( $owner, $site['brand_kit'] ?? null ),
				'complianceFooter' => $site['compliance_footer'],
				'bannerCampaigns'  => SiteSettingsController::active_banner_campaigns(),
			]
		);
	}

	/**
	 * `POST /admin/signatures/:id/html`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function store_html( \WP_REST_Request $request ) {
		$signature = $this->repo->find( (int) $request['id'] );
		if ( null === $signature ) {
			return $this->not_found();
		}

		$expected = $request->get_param( 'expected_updated_at' );
		if ( is_string( $expected ) && '' !== $expected && $expected !== $signature->updated_at ) {
			return new \WP_Error(
				'imgsig_conflict',
				__( 'The signature changed after it was loaded. Load it again and recompile.', 'imagina-signatures' ),
				[
					'status'     => 409,
					'updated_at' => $signature->updated_at,
				]
			);
		}

		$data = [ 'html' => (string) $request->get_param( 'html' ) ];
		if ( is_string( $request->get_param( 'text' ) ) ) {
			$data['text'] = (string) $request->get_param( 'text' );
		}

		try {
			$stored = $this->service->store_html( $signature->id, $data );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		} catch ( \Throwable $e ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[imagina-signatures] team html store failed: ' . $e->getMessage() );
			return new \WP_Error(
				'imgsig_persistence_failed',
				__( 'The compiled signature could not be stored because of a server error.', 'imagina-signatures' ),
				[ 'status' => 500 ]
			);
		}

		return rest_ensure_response( self::html_state( $stored ) );
	}

	/**
	 * Compile state returned after storing HTML.
	 *
	 * @param Signature $signature Stored row.
	 *
	 * @return array<string, mixed>
	 */
	private static function html_state( Signature $signature ): array {
		return [
			'id'          => $signature->id,
			'user_id'     => $signature->user_id,
			'compiled_at' => $signature->compiled_at,
			'updated_at'  => $signature->updated_at,
			'html_stale'  => $signature->is_html_stale(),
		];
	}

	/**
	 * @return \WP_Error
	 */
	private function not_found(): \WP_Error {
		return new \WP_Error(
			'imgsig_not_found',
			__( 'Signature not found.', 'imagina-signatures' ),
			[ 'status' => 404 ]
		);
	}
}
