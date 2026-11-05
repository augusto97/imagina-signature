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
use ImaginaSignatures\Services\HtmlSanitizer;
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
 * Rate limits (fixed windows, per user, filterable through
 * `imgsig/rate_limit/max`): create 30/hour, duplicate 30/hour,
 * update 240/hour, test-send 6/hour per user + 100/hour site-wide.
 *
 * @since 1.0.0
 */
final class SignaturesController extends BaseController {

	/**
	 * Rate-limit action names.
	 */
	private const RL_ACTION_CREATE    = 'signatures_create';
	private const RL_ACTION_UPDATE    = 'signatures_update';
	private const RL_ACTION_DUPLICATE = 'signatures_duplicate';
	private const RL_ACTION_TEST_SEND = 'signatures_test_send';

	/**
	 * Per-user hourly limits.
	 */
	private const RL_MAX_CREATE    = 30;
	private const RL_MAX_UPDATE    = 240;
	private const RL_MAX_DUPLICATE = 30;
	private const RL_MAX_TEST_SEND = 6;

	/**
	 * Default site-wide cap on test-send emails per hour (all users).
	 */
	private const RL_SITE_MAX_TEST_SEND = 100;

	/**
	 * Maximum accepted size of the test-send `html` payload (bytes).
	 */
	private const TEST_SEND_MAX_BYTES = 204800;

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
	 * @var HtmlSanitizer
	 */
	private HtmlSanitizer $html_sanitizer;

	/**
	 * @param SignatureService    $service        Signature service.
	 * @param SignatureRepository $repo           Signature repository.
	 * @param RateLimiter         $rate_limiter   Rate limiter.
	 * @param HtmlSanitizer|null  $html_sanitizer Email HTML sanitizer (test-send).
	 */
	public function __construct( SignatureService $service, SignatureRepository $repo, RateLimiter $rate_limiter, ?HtmlSanitizer $html_sanitizer = null ) {
		$this->service        = $service;
		$this->repo           = $repo;
		$this->rate_limiter   = $rate_limiter;
		$this->html_sanitizer = $html_sanitizer ?? new HtmlSanitizer();
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
		// `SELECT 1` — the permission callback only needs a yes/no; the
		// handler fetches the row it actually uses.
		return $this->repo->exists_owned_by( $signature_id, $user_id );
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

		// List rows are a summary projection (no json_content /
		// html_cache — the LONGTEXT columns aren't even selected) unless
		// the caller asks for `context=edit`. GET /signatures/:id still
		// returns the full row.
		$full = 'edit' === $request->get_param( 'context' );

		$args = [
			'status'   => $request->get_param( 'status' ),
			'search'   => $request->get_param( 'search' ),
			'page'     => $this->read_int( $request, 'page', 1 ),
			'per_page' => $this->read_int( $request, 'per_page', 20 ),
			'order_by' => $request->get_param( 'order_by' ),
			'order'    => $request->get_param( 'order' ),
			'fields'   => $full ? 'all' : 'summary',
		];

		$items = $this->repo->find_by_user( $user_id, $args );
		$total = $this->repo->count_by_user( $user_id, $args );

		$payload = [];
		foreach ( $items as $signature ) {
			$payload[] = $full ? $signature->to_array() : $signature->to_summary_array();
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
			$this->rate_limiter->check( self::RL_ACTION_CREATE, $user_id, self::RL_MAX_CREATE, self::RL_WINDOW_SECONDS );
			$signature = $this->service->create( $user_id, $this->read_payload( $request ) );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		} catch ( \Throwable $e ) {
			// Catch the read-after-write verify failures (and anything
			// else that bubbles up from the service / repository) so
			// the REST layer always returns a structured WP_Error. The
			// raw message (SQL errors, table names, hashes) is logged,
			// never returned.
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[imagina-signatures] create failed: ' . $e->getMessage() );
			return $this->persistence_error();
		}

		$response = rest_ensure_response( $this->with_notes( $signature->to_array() ) );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * Generic 500 for unexpected persistence failures (details are in
	 * the server error log).
	 *
	 * @since 1.0.40
	 *
	 * @return \WP_Error
	 */
	private function persistence_error(): \WP_Error {
		return new \WP_Error(
			'imgsig_persistence_failed',
			__( 'The signature could not be saved because of a server error. Please try again; if it keeps failing, ask a site administrator to check the error log.', 'imagina-signatures' ),
			[ 'status' => 500 ]
		);
	}

	/**
	 * Appends the service's sanitisation notes to a response payload
	 * (additive, and only when the server actually removed something —
	 * the common clean-save response is unchanged).
	 *
	 * @since 1.0.40
	 *
	 * @param array<string, mixed> $payload Serialised signature.
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
	 * `GET /signatures/:id`.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function show( \WP_REST_Request $request ) {
		// Served from the repository's request cache when the service
		// already loaded this row.
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
			$this->rate_limiter->check( self::RL_ACTION_UPDATE, get_current_user_id(), self::RL_MAX_UPDATE, self::RL_WINDOW_SECONDS );
			$signature = $this->service->update(
				(int) $request['id'],
				get_current_user_id(),
				$this->read_payload( $request )
			);
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		} catch ( \Throwable $e ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[imagina-signatures] update failed: ' . $e->getMessage() );
			return $this->persistence_error();
		}

		return rest_ensure_response( $this->with_notes( $signature->to_array() ) );
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
			$this->rate_limiter->check( self::RL_ACTION_DUPLICATE, get_current_user_id(), self::RL_MAX_DUPLICATE, self::RL_WINDOW_SECONDS );
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
	 * current user's own address so they can copy / paste it from their
	 * real mail client.
	 *
	 * The compile pipeline is TypeScript-only, so the HTML arrives from
	 * the browser and is treated as untrusted: it is capped at 200 KB,
	 * reduced to the email-safe table / image / link subset
	 * ({@see HtmlSanitizer::sanitize_email_document()} — no scripts,
	 * forms, iframes or `on*` handlers) and sent as multipart/alternative
	 * with a plain-text part. The recipient is always the WP user's own
	 * email — never a request parameter.
	 *
	 * Rate-limited per user (6/hour) AND site-wide (100/hour by default,
	 * `imgsig/mail/test_send_site_max`) so many compromised accounts —
	 * or one account firing in parallel — can't turn the site's domain
	 * into a mail relay.
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

		if ( ! $user || empty( $user->user_email ) || ! is_email( $user->user_email ) ) {
			return new \WP_Error(
				'imgsig_no_email',
				__( 'Your WordPress account has no email address on file.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$raw_html = (string) $request->get_param( 'html' );

		if ( '' === trim( $raw_html ) ) {
			return new \WP_Error(
				'imgsig_empty_html',
				__( 'No HTML supplied to send.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		if ( strlen( $raw_html ) > self::TEST_SEND_MAX_BYTES ) {
			return new \WP_Error(
				'imgsig_html_too_large',
				sprintf(
					/* translators: %d: maximum size in KB. */
					__( 'The signature HTML is too large to send (maximum %d KB).', 'imagina-signatures' ),
					(int) ( self::TEST_SEND_MAX_BYTES / 1024 )
				),
				[ 'status' => 413 ]
			);
		}

		/**
		 * Filters the site-wide cap on test-send emails per hour.
		 *
		 * @since 1.0.40
		 *
		 * @param int $max Default 100. Return 0 to disable the site-wide cap.
		 */
		$site_max = (int) apply_filters( 'imgsig/mail/test_send_site_max', self::RL_SITE_MAX_TEST_SEND );

		try {
			$this->rate_limiter->check( self::RL_ACTION_TEST_SEND, $user_id, self::RL_MAX_TEST_SEND, self::RL_WINDOW_SECONDS );
			$this->rate_limiter->check_site( self::RL_ACTION_TEST_SEND, $site_max, self::RL_WINDOW_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$html = $this->html_sanitizer->sanitize_email_document( $raw_html );
		if ( '' === trim( wp_strip_all_tags( $html ) ) && false === stripos( $html, '<img' ) ) {
			return new \WP_Error(
				'imgsig_empty_html',
				__( 'Nothing sendable was left after removing unsupported HTML.', 'imagina-signatures' ),
				[ 'status' => 400 ]
			);
		}

		$subject = (string) ( $request->get_param( 'subject' ) ?: __( 'Imagina Signatures — your signature preview', 'imagina-signatures' ) );
		$subject = mb_substr( sanitize_text_field( $subject ), 0, 150 );

		$intro = sprintf(
			/* translators: %s: user's display name. */
			__( 'Hi %s — here is the signature you just designed in Imagina Signatures. Copy it from below and paste it into your email client.', 'imagina-signatures' ),
			$user->display_name
		);

		$body = sprintf(
			'<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;max-width:640px;margin:0 auto;padding:24px"><p style="margin:0 0 18px;color:#475569">%s</p><div style="border-top:1px dashed #cbd5e1;margin:18px 0"></div>%s</div>',
			esc_html( $intro ),
			$html
		);

		$alt_body = wp_strip_all_tags( $intro ) . "\n\n" . $this->html_sanitizer->to_plain_text( $html );

		// wp_mail() has no multipart API; PHPMailer turns a non-empty
		// AltBody into multipart/alternative. Scoped to this one send.
		$set_alt_body = static function ( $phpmailer ) use ( $alt_body ): void {
			if ( is_object( $phpmailer ) && property_exists( $phpmailer, 'AltBody' ) ) {
				$phpmailer->AltBody = $alt_body; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
			}
		};
		add_action( 'phpmailer_init', $set_alt_body );

		try {
			$sent = wp_mail(
				$user->user_email,
				$subject,
				$body,
				[ 'Content-Type: text/html; charset=UTF-8' ]
			);
		} finally {
			remove_action( 'phpmailer_init', $set_alt_body );
		}

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
			'context'  => [
				'type'    => 'string',
				'enum'    => [ 'view', 'edit' ],
				'default' => 'view',
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
