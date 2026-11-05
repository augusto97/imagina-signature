<?php
/**
 * Install-link endpoints.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Deployment\Install\InstallService;
use ImaginaSignatures\Deployment\Install\InstallTokens;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Routes of the personal install link (Fase 2):
 *
 *  - `POST /install/(?P<token>[a-f0-9]{64})/installed` — public, the
 *    token is the credential. Records "I've installed it" for the
 *    token's owner. Rate limited per client IP (before the token is
 *    even looked up) and per owner.
 *  - `GET  /me/install-link`            — the caller's link (token created on first use) + status.
 *  - `POST /me/install-link/regenerate` — new token; old links stop working.
 *  - `GET  /admin/deploy/install-links/(?P<user_id>\d+)`            — [manage_team] a user's link + status.
 *  - `POST /admin/deploy/install-links/(?P<user_id>\d+)/regenerate` — [manage_team] replace a user's token.
 *
 * @since 1.3.0
 */
final class InstallController extends BaseController {

	private const RL_INSTALLED_IP     = 'install_ip';
	private const RL_INSTALLED_USER   = 'install_installed';
	private const RL_REGENERATE       = 'install_regenerate';
	private const RL_MAX_PER_IP       = 60;
	private const RL_MAX_PER_USER     = 10;
	private const RL_MAX_REGENERATE   = 10;
	private const RL_WINDOW_SECONDS   = HOUR_IN_SECONDS;
	private const TOKEN_ROUTE_PATTERN = '(?P<token>[a-f0-9]{64})';

	/**
	 * @var InstallService
	 */
	private InstallService $service;

	/**
	 * @var RateLimiter
	 */
	private RateLimiter $rate_limiter;

	/**
	 * @param InstallService $service      Install status service.
	 * @param RateLimiter    $rate_limiter Rate limiter.
	 */
	public function __construct( InstallService $service, RateLimiter $rate_limiter ) {
		$this->service      = $service;
		$this->rate_limiter = $rate_limiter;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/install/' . self::TOKEN_ROUTE_PATTERN . '/installed',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'installed' ],
					'permission_callback' => [ $this, 'check_token' ],
					'args'                => [
						'client' => [
							'type'              => 'string',
							'required'          => false,
							'sanitize_callback' => 'sanitize_key',
						],
					],
				],
			]
		);

		$require_use  = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_USE );
		$require_team = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM );

		register_rest_route(
			self::NAMESPACE,
			'/me/install-link',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'my_link' ],
					'permission_callback' => $require_use,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/me/install-link/regenerate',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'regenerate_my_link' ],
					'permission_callback' => $require_use,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/deploy/install-links/(?P<user_id>\d+)',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'user_link' ],
					'permission_callback' => $require_team,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/deploy/install-links/(?P<user_id>\d+)/regenerate',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'regenerate_user_link' ],
					'permission_callback' => $require_team,
				],
			]
		);
	}

	/**
	 * Permission callback of the public endpoint: per-IP rate limit, then
	 * the token must belong to a user who can use signatures.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return bool|\WP_Error
	 */
	public function check_token( \WP_REST_Request $request ) {
		try {
			$this->rate_limiter->check_site( self::RL_INSTALLED_IP . '_' . self::client_fingerprint(), self::RL_MAX_PER_IP, self::RL_WINDOW_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$user_id = InstallTokens::resolve_user_id( (string) $request->get_param( 'token' ) );
		$user    = $user_id > 0 ? get_userdata( $user_id ) : false;
		if ( ! $user || ! user_can( $user, CapabilitiesInstaller::CAP_USE ) ) {
			return new \WP_Error(
				'imgsig_invalid_install_link',
				__( 'This install link is not valid.', 'imagina-signatures' ),
				[ 'status' => 404 ]
			);
		}

		return true;
	}

	/**
	 * `POST /install/:token/installed`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound (token already validated).
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function installed( \WP_REST_Request $request ) {
		// Resolved again (cheap) rather than trusting anything the
		// permission callback could have stashed on the request.
		$user_id = InstallTokens::resolve_user_id( (string) $request->get_param( 'token' ) );
		if ( $user_id <= 0 ) {
			return new \WP_Error( 'imgsig_invalid_install_link', __( 'This install link is not valid.', 'imagina-signatures' ), [ 'status' => 404 ] );
		}

		try {
			$this->rate_limiter->check( self::RL_INSTALLED_USER, $user_id, self::RL_MAX_PER_USER, self::RL_WINDOW_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$signature = $this->service->primary( $user_id );
		if ( null === $signature || ! InstallService::is_deployable( $signature ) ) {
			return new \WP_Error(
				'imgsig_signature_not_ready',
				__( 'Your signature is being prepared. Try again later.', 'imagina-signatures' ),
				[ 'status' => 409 ]
			);
		}

		$record = $this->service->mark_installed( $user_id, $signature, (string) $request->get_param( 'client' ) );

		return rest_ensure_response(
			[
				'installed'    => true,
				'state'        => InstallService::STATE_INSTALLED,
				'installed_at' => $record['installed_at'] ?? null,
			]
		);
	}

	/**
	 * `GET /me/install-link`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function my_link(): \WP_REST_Response {
		return rest_ensure_response( $this->link_payload( get_current_user_id() ) );
	}

	/**
	 * `POST /me/install-link/regenerate`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function regenerate_my_link() {
		$user_id = get_current_user_id();
		try {
			$this->rate_limiter->check( self::RL_REGENERATE, $user_id, self::RL_MAX_REGENERATE, self::RL_WINDOW_SECONDS );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}
		InstallTokens::regenerate( $user_id );
		return rest_ensure_response( $this->link_payload( $user_id ) );
	}

	/**
	 * `GET /admin/deploy/install-links/:user_id`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function user_link( \WP_REST_Request $request ) {
		$user_id = $this->existing_user_id( $request );
		if ( $user_id instanceof \WP_Error ) {
			return $user_id;
		}
		return rest_ensure_response( $this->link_payload( $user_id ) );
	}

	/**
	 * `POST /admin/deploy/install-links/:user_id/regenerate`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function regenerate_user_link( \WP_REST_Request $request ) {
		$user_id = $this->existing_user_id( $request );
		if ( $user_id instanceof \WP_Error ) {
			return $user_id;
		}
		InstallTokens::regenerate( $user_id );
		return rest_ensure_response( $this->link_payload( $user_id ) );
	}

	/**
	 * URL (token created on first use) + install status.
	 *
	 * @param int $user_id User.
	 *
	 * @return array<string, mixed>
	 */
	private function link_payload( int $user_id ): array {
		return [
			'user_id' => $user_id,
			'url'     => InstallTokens::url_for_user( $user_id ),
		] + $this->service->summary( $user_id );
	}

	/**
	 * `user_id` route param of an existing user.
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return int|\WP_Error
	 */
	private function existing_user_id( \WP_REST_Request $request ) {
		$user_id = (int) $request->get_param( 'user_id' );
		if ( $user_id <= 0 || ! get_userdata( $user_id ) ) {
			return new \WP_Error( 'imgsig_user_not_found', __( 'User not found.', 'imagina-signatures' ), [ 'status' => 404 ] );
		}
		return $user_id;
	}

	/**
	 * Short, non-reversible id of the client IP for the per-IP bucket.
	 * Only `REMOTE_ADDR` (forwarding headers are client-controlled).
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public static function client_fingerprint(): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( (string) $_SERVER['REMOTE_ADDR'] ) ) : '';
		return substr( hash( 'sha256', '' !== $ip ? $ip : 'unknown' ), 0, 20 );
	}
}
