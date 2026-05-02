<?php
/**
 * Signatures CRUD endpoints.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Api\Middleware\OwnershipCheck;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Signature endpoints (CLAUDE.md §16.2).
 *
 * Routes:
 *  - `GET    /signatures`             — list owned by caller
 *  - `POST   /signatures`             — create
 *  - `GET    /signatures/:id`         — read (ownership-gated)
 *  - `PATCH  /signatures/:id`         — update
 *  - `DELETE /signatures/:id`         — delete
 *  - `POST   /signatures/:id/duplicate`
 *
 * Every gate goes through {@see OwnershipCheck} for routes carrying
 * an `id` parameter, so by the time the handler runs we know the row
 * exists and is owned by the current user. Service-layer exceptions
 * are translated to `WP_Error` via {@see exception_to_wp_error()}.
 *
 * Rate limit: creates are throttled at 30/hour (CLAUDE.md §29 SIEMPRE
 * + §7.3 default).
 *
 * @since 1.0.0
 */
final class SignaturesController extends BaseController {

	/**
	 * Rate-limit action name used for throttling create operations.
	 */
	private const RL_ACTION_CREATE = 'signatures_create';

	/**
	 * Window over which create rate is measured (seconds).
	 */
	private const RL_WINDOW_SECONDS = HOUR_IN_SECONDS;

	/**
	 * @var SignatureService
	 */
	private SignatureService $service;

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $repo;

	/**
	 * @var RateLimiter
	 */
	private RateLimiter $rate_limiter;

	/**
	 * @param SignatureService    $service      Signature service.
	 * @param SignatureRepository $repo         Signature repository.
	 * @param RateLimiter         $rate_limiter Rate limiter.
	 */
	public function __construct( SignatureService $service, SignatureRepository $repo, RateLimiter $rate_limiter ) {
		$this->service      = $service;
		$this->repo         = $repo;
		$this->rate_limiter = $rate_limiter;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_use = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_USE );
		$ownership   = ( new OwnershipCheck(
			CapabilitiesInstaller::CAP_USE,
			[ $this, 'owns_signature' ]
		) )->callback();

		register_rest_route(
			self::NAMESPACE,
			'/signatures',
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
					'permission_callback' => $require_use,
					'args'                => $this->write_args( true ),
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/signatures/(?P<id>\d+)',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $ownership,
				],
				[
					// `WP_REST_Server::EDITABLE` = POST | PUT | PATCH.
					// Accepting all three keeps autosave's PATCH
					// working on hosts where a WAF (LiteSpeed,
					// mod_security CRS, Cloudflare default rules)
					// strips PATCH at the proxy layer.
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $ownership,
					'args'                => $this->write_args( false ),
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [ $this, 'delete' ],
					'permission_callback' => $ownership,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/signatures/(?P<id>\d+)/duplicate',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'duplicate' ],
					'permission_callback' => $ownership,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/signatures/test-send',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'test_send' ],
					'permission_callback' => $require_use,
					'args'                => [
						'html' => [
							'type'     => 'string',
							'required' => true,
						],
						'subject' => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						],
					],
				],
			]
		);
	}

	/**
	 * Ownership probe for {@see OwnershipCheck}. Returns true when the
	 * given signature belongs to the user.
	 *
	 * @since 1.0.0
	 *
	 * @param int $signature_id Signature primary key.
	 * @param int $user_id      Caller's user ID.
	 *
	 * @return bool
	 */
	public function owns_signature( int $signature_id, int $user_id ): bool {
		return null !== $this->repo->find_owned_by( $signature_id, $user_id );
	}

	/**
	 * `GET /signatures`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function index( \WP_REST_Request $request ): \WP_REST_Response {
		$user_id = get_current_user_id();
		$args    = [
			'status'   => $request->get_param( 'status' ),
			'search'   => $request->get_param( 'search' ),
			'page'     => $this->read_int( $request, 'page', 1 ),
			'per_page' => $this->read_int( $request, 'per_page', 20 ),
			'order_by' => $request->get_param( 'order_by' ),
			'order'    => $request->get_param( 'order' ),
		];

		$items = $this->repo->find_by_user( $user_id, $args );
		$total = $this->repo->count_by_user( $user_id, $args );

		$payload = [];
		foreach ( $items as $signature ) {
			$payload[] = $signature->to_array();
		}

		return $this->paginated_response( $payload, $total, (int) $args['per_page'] );
	}

	/**
	 * `POST /signatures`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function create( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();

		try {
			$this->rate_limiter->check( self::RL_ACTION_CREATE, $user_id, 30, self::RL_WINDOW_SECONDS );
			$signature = $this->service->create( $user_id, $this->read_payload( $request ) );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$response = rest_ensure_response( $signature->to_array() );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * `GET /signatures/:id`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function show( \WP_REST_Request $request ) {
		$signature = $this->repo->find_owned_by( (int) $request['id'], get_current_user_id() );
		if ( null === $signature ) {
			return new \WP_Error(
				'imgsig_not_found',
				__( 'Signature not found.', 'imagina-signatures' ),
				[ 'status' => 404 ]
			);
		}
		return rest_ensure_response( $signature->to_array() );
	}

	/**
	 * `PATCH /signatures/:id`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update( \WP_REST_Request $request ) {
		try {
			$signature = $this->service->update(
				(int) $request['id'],
				get_current_user_id(),
				$this->read_payload( $request )
			);
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		return rest_ensure_response( $signature->to_array() );
	}

	/**
	 * `DELETE /signatures/:id`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete( \WP_REST_Request $request ) {
		try {
			$this->service->delete( (int) $request['id'], get_current_user_id() );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		return rest_ensure_response( [ 'deleted' => true ] );
	}

	/**
	 * `POST /signatures/:id/duplicate`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function duplicate( \WP_REST_Request $request ) {
		try {
			$copy = $this->service->duplicate( (int) $request['id'], get_current_user_id() );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$response = rest_ensure_response( $copy->to_array() );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * `POST /signatures/test-send` — emails the compiled HTML to the
	 * current user's address so they can copy / paste from their real
	 * mail client without having to mess with the raw markup.
	 *
	 * The frontend is the source of truth for the compiled HTML (the
	 * compile pipeline is TypeScript-only); this endpoint just wraps
	 * it in a tiny mail-shell and dispatches via `wp_mail`. We never
	 * accept an arbitrary `to` address — only the WP user's own email.
	 *
	 * Rate-limited at 6 sends per hour to keep this from becoming a
	 * spam channel for compromised accounts.
	 *
	 * @since 1.0.16
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function test_send( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();
		$user    = wp_get_current_user();

		if ( ! $user || empty( $user->user_email ) ) {
			return new \WP_Error(
				'imgsig_no_email',
				__( 'Your WordPress account has no email address on file.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		try {
			$this->rate_limiter->check( 'signatures_test_send', $user_id, 6, HOUR_IN_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$html    = (string) $request->get_param( 'html' );
		$subject = (string) ( $request->get_param( 'subject' ) ?: __( 'Imagina Signatures — your signature preview', 'imagina-signatures' ) );

		if ( '' === trim( $html ) ) {
			return new \WP_Error(
				'imgsig_empty_html',
				__( 'No HTML supplied to send.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		// We trust the HTML because it came out of our own compile
		// pipeline running in the user's browser, but wrap it in a
		// mail-shell that explains what they're seeing.
		$intro = sprintf(
			/* translators: %s: user's display name. */
			esc_html__( 'Hi %s — here is the signature you just designed in Imagina Signatures. Copy it from below and paste it into your email client.', 'imagina-signatures' ),
			esc_html( $user->display_name )
		);

		$body = sprintf(
			'<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;max-width:640px;margin:0 auto;padding:24px"><p style="margin:0 0 18px;color:#475569">%s</p><div style="border-top:1px dashed #cbd5e1;margin:18px 0"></div>%s</div>',
			$intro,
			$html
		);

		$headers = [ 'Content-Type: text/html; charset=UTF-8' ];

		$sent = wp_mail( $user->user_email, $subject, $body, $headers );

		if ( ! $sent ) {
			return new \WP_Error(
				'imgsig_mail_failed',
				__( 'wp_mail() failed. Check your site\'s email configuration.', 'imagina-signatures' ),
				[ 'status' => 500 ]
			);
		}

		return rest_ensure_response(
			[
				'sent'      => true,
				'recipient' => $user->user_email,
			]
		);
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

		if ( null !== $request->get_param( 'name' ) ) {
			$payload['name'] = (string) $request->get_param( 'name' );
		}

		if ( null !== $request->get_param( 'status' ) ) {
			$payload['status'] = (string) $request->get_param( 'status' );
		}

		if ( null !== $request->get_param( 'template_id' ) ) {
			$payload['template_id'] = (int) $request->get_param( 'template_id' );
		}

		if ( null !== $request->get_param( 'json_content' ) ) {
			$payload['json_content'] = $request->get_param( 'json_content' );
		}

		return $payload;
	}

	/**
	 * REST `args` definition for the list endpoint.
	 *
	 * @since 1.0.0
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function index_args(): array {
		return [
			'status'   => [
				'type'              => 'string',
				'enum'              => [ 'draft', 'ready', 'archived' ],
				'sanitize_callback' => 'sanitize_text_field',
			],
			'search'   => [
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
				'default' => 20,
			],
			'order_by' => [
				'type' => 'string',
				'enum' => [ 'updated_at', 'created_at', 'name' ],
			],
			'order'    => [
				'type' => 'string',
				'enum' => [ 'asc', 'desc' ],
			],
		];
	}

	/**
	 * REST `args` definition for create / update.
	 *
	 * @since 1.0.0
	 *
	 * @param bool $is_create When true, `name` is required.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function write_args( bool $is_create ): array {
		return [
			'name'         => [
				'type'              => 'string',
				'required'          => $is_create,
				'sanitize_callback' => 'sanitize_text_field',
			],
			'status'       => [
				'type' => 'string',
				'enum' => [ 'draft', 'ready', 'archived' ],
			],
			'template_id'  => [
				'type'    => 'integer',
				'minimum' => 1,
			],
			'json_content' => [
				'type' => 'object',
			],
		];
	}
}
