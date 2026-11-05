<?php
/**
 * Microsoft 365 / Outlook add-in endpoints.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Deployment\OutlookCors;
use ImaginaSignatures\Deployment\OutlookManifest;
use ImaginaSignatures\Deployment\OutlookSettings;
use ImaginaSignatures\Deployment\OutlookSignatureService;
use ImaginaSignatures\Deployment\OutlookWellKnown;
use ImaginaSignatures\Exceptions\RateLimitException;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Routes of the Outlook add-in deployment (CLAUDE.md §0.1, Fase 2).
 *
 * Public, protected by the deployment key ({@see OutlookSettings}):
 *
 *  - `GET /outlook/manifest.xml?key=…` (also `/outlook/manifest`) — the
 *    add-in manifest, `text/xml`. The key is required because the
 *    manifest embeds it; `&download=1` adds `Content-Disposition`.
 *  - `GET /outlook/signature?email=…` + header `X-Imgsig-Deploy-Key` —
 *    `{ html, hash, replace_client_signature }` for the user whose
 *    `user_email` matches, 404 otherwise.
 *
 * Both answer 404 while the integration is disabled, 401 for a missing
 * or wrong key (compared with `hash_equals`), and are rate limited per
 * client IP and per key (429 + `Retry-After`). Repeated wrong keys from
 * one IP are limited separately and much more tightly. CORS: see
 * {@see OutlookCors}.
 *
 * Admin (`imgsig_manage_team`):
 *
 *  - `GET /admin/outlook`               — state for the Settings tab.
 *  - `POST|PUT|PATCH /admin/outlook`    — `enabled`, `replace_client_signature`.
 *  - `POST /admin/outlook/regenerate-key` — new key; old manifests stop working.
 *
 * @since 1.3.0
 */
final class OutlookController extends BaseController {

	/** Per-IP window for the signature endpoint (requests / window). */
	public const SIGNATURE_IP_MAX    = 600;
	public const SIGNATURE_IP_WINDOW = 600;

	/** Per-key window for the signature endpoint (whole tenant). */
	public const SIGNATURE_KEY_MAX    = 10000;
	public const SIGNATURE_KEY_WINDOW = 3600;

	/** Per-IP window for the manifest. */
	public const MANIFEST_IP_MAX    = 30;
	public const MANIFEST_IP_WINDOW = 600;

	/** Wrong / missing keys tolerated per IP before answering 429. */
	public const AUTH_FAIL_MAX    = 20;
	public const AUTH_FAIL_WINDOW = 600;

	/** Download file name of the manifest. */
	public const MANIFEST_FILENAME = 'imagina-signatures-outlook-manifest.xml';

	/**
	 * @var OutlookSignatureService
	 */
	private OutlookSignatureService $service;

	/**
	 * @var RateLimiter
	 */
	private RateLimiter $rate_limiter;

	/**
	 * @param OutlookSignatureService $service      Signature resolver.
	 * @param RateLimiter             $rate_limiter Rate limiter.
	 */
	public function __construct( OutlookSignatureService $service, RateLimiter $rate_limiter ) {
		$this->service      = $service;
		$this->rate_limiter = $rate_limiter;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/outlook/manifest(?:\.xml)?',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'manifest' ],
					// Public: Microsoft 365 may fetch it; the key is checked in the callback.
					'permission_callback' => '__return_true',
					'args'                => [
						'key'      => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						],
						'download' => [ 'type' => 'boolean' ],
					],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/outlook/signature',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'signature' ],
					// Public: called by the add-in; the key is checked in the callback.
					'permission_callback' => '__return_true',
					'args'                => [
						'email' => [
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						],
					],
				],
			]
		);

		$require_team = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_TEAM );

		register_rest_route(
			self::NAMESPACE,
			'/admin/outlook',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show_settings' ],
					'permission_callback' => $require_team,
				],
				[
					// POST as well as PATCH: some WAFs strip PATCH (see SiteSettingsController).
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => [ $this, 'update_settings' ],
					'permission_callback' => $require_team,
					'args'                => [
						'enabled'                  => [ 'type' => 'boolean' ],
						'replace_client_signature' => [ 'type' => 'boolean' ],
					],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/outlook/regenerate-key',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'regenerate_key' ],
					'permission_callback' => $require_team,
				],
			]
		);

		OutlookCors::register();
		add_filter( 'rest_pre_serve_request', [ self::class, 'serve_raw_xml' ], 30, 4 );
	}

	/**
	 * `GET /outlook/manifest.xml`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Request.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function manifest( \WP_REST_Request $request ) {
		$settings = OutlookSettings::get();
		if ( empty( $settings['enabled'] ) ) {
			return self::not_available();
		}

		$ip = $this->client_ip();
		try {
			$this->rate_limiter->check_subject( 'outlook_manifest_ip', $ip, self::MANIFEST_IP_MAX, self::MANIFEST_IP_WINDOW );
		} catch ( RateLimitException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$key = $request->get_param( 'key' );
		$key = is_string( $key ) ? $key : '';
		if ( '' === $key ) {
			$key = $this->header_key( $request );
		}
		$denied = $this->deny_unless_key( $key, $settings, $ip );
		if ( null !== $denied ) {
			return $denied;
		}

		$response = new \WP_REST_Response( OutlookManifest::for_site( $settings )->to_xml(), 200 );
		$response->header( 'Content-Type', 'text/xml; charset=utf-8' );
		$response->header( 'X-Content-Type-Options', 'nosniff' );
		if ( rest_sanitize_boolean( $request->get_param( 'download' ) ) ) {
			$response->header( 'Content-Disposition', 'attachment; filename="' . self::MANIFEST_FILENAME . '"' );
		}
		return $response;
	}

	/**
	 * `GET /outlook/signature?email=`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Request.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function signature( \WP_REST_Request $request ) {
		$settings = OutlookSettings::get();
		if ( empty( $settings['enabled'] ) ) {
			return self::not_available();
		}

		$ip = $this->client_ip();
		try {
			$this->rate_limiter->check_subject( 'outlook_signature_ip', $ip, self::SIGNATURE_IP_MAX, self::SIGNATURE_IP_WINDOW );
		} catch ( RateLimitException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$key    = $this->header_key( $request );
		$denied = $this->deny_unless_key( $key, $settings, $ip );
		if ( null !== $denied ) {
			return $denied;
		}

		try {
			$this->rate_limiter->check_subject( 'outlook_signature_key', $key, self::SIGNATURE_KEY_MAX, self::SIGNATURE_KEY_WINDOW );
		} catch ( RateLimitException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		$email    = $request->get_param( 'email' );
		$resolved = is_string( $email ) ? $this->service->resolve( $email ) : null;
		if ( null === $resolved ) {
			return self::not_available();
		}

		$this->service->record_delivery( $resolved['user_id'], $resolved['hash'] );

		return new \WP_REST_Response(
			[
				'html'                     => $resolved['html'],
				'hash'                     => $resolved['hash'],
				'replace_client_signature' => ! empty( $settings['replace_client_signature'] ),
			],
			200
		);
	}

	/**
	 * `GET /admin/outlook`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function show_settings(): \WP_REST_Response {
		return rest_ensure_response( self::admin_state( OutlookSettings::get() ) );
	}

	/**
	 * `POST|PUT|PATCH /admin/outlook`.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_REST_Request $request Request.
	 *
	 * @return \WP_REST_Response
	 */
	public function update_settings( \WP_REST_Request $request ): \WP_REST_Response {
		$patch = [];
		foreach ( [ 'enabled', 'replace_client_signature' ] as $field ) {
			$value = $request->get_param( $field );
			if ( null !== $value ) {
				$patch[ $field ] = $value;
			}
		}
		return rest_ensure_response( self::admin_state( OutlookSettings::update( $patch ) ) );
	}

	/**
	 * `POST /admin/outlook/regenerate-key`.
	 *
	 * @since 1.3.0
	 *
	 * @return \WP_REST_Response
	 */
	public function regenerate_key(): \WP_REST_Response {
		return rest_ensure_response( self::admin_state( OutlookSettings::regenerate_key() ) );
	}

	/**
	 * Payload of the admin endpoints. Carries the manifest URLs (which
	 * contain the key) — only ever returned to team managers.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $settings Settings.
	 *
	 * @return array<string, mixed>
	 */
	public static function admin_state( array $settings ): array {
		$key      = (string) $settings['deploy_key'];
		$manifest = rest_url( self::NAMESPACE . '/outlook/manifest.xml' );
		$download = rest_url( self::NAMESPACE . '/outlook/manifest' );
		$endpoint = rest_url( self::NAMESPACE . '/outlook/signature' );
		$context  = OutlookManifest::context( $settings );

		return [
			'enabled'                  => ! empty( $settings['enabled'] ),
			'replace_client_signature' => ! empty( $settings['replace_client_signature'] ),
			'add_in_id'                => (string) $settings['add_in_id'],
			'version'                  => (string) $context['version'],
			'display_name'             => (string) $context['display_name'],
			'key_preview'              => '…' . substr( $key, -6 ),
			'manifest_url'             => add_query_arg( 'key', $key, $manifest ),
			'manifest_download_url'    => add_query_arg(
				[
					'key'      => $key,
					'download' => '1',
				],
				$download
			),
			'signature_endpoint'       => $endpoint,
			'https'                    => self::all_https( [ home_url( '/' ), $endpoint, (string) $context['assets_url'] ] ),
			'well_known_url'           => OutlookWellKnown::url(),
			'well_known_served'        => OutlookWellKnown::at_origin_root(),
		];
	}

	/**
	 * `rest_pre_serve_request`: sends the manifest as raw XML instead of
	 * a JSON-encoded string. Runs after {@see OutlookCors::send_headers()}.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $served  Whether the request was already served.
	 * @param mixed $result  Response.
	 * @param mixed $request Request.
	 * @param mixed $server  REST server (unused).
	 *
	 * @return mixed
	 */
	public static function serve_raw_xml( $served, $result = null, $request = null, $server = null ) {
		unset( $server );
		if ( $served || ! $result instanceof \WP_REST_Response || ! $request instanceof \WP_REST_Request ) {
			return $served;
		}
		if ( 1 !== preg_match( '#/outlook/manifest(?:\.xml)?$#', (string) $request->get_route() ) ) {
			return $served;
		}
		$data = $result->get_data();
		if ( 200 !== $result->get_status() || ! is_string( $data ) ) {
			return $served;
		}

		echo $data; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- XML document built with every value escaped (OutlookManifest::esc()).
		return true;
	}

	/**
	 * Returns a 401 (or 429 after too many failures from this IP) when
	 * `$key` isn't the deployment key; null when it is.
	 *
	 * @param string               $key      Presented key.
	 * @param array<string, mixed> $settings Settings.
	 * @param string               $ip       Client IP.
	 *
	 * @return \WP_Error|null
	 */
	private function deny_unless_key( string $key, array $settings, string $ip ): ?\WP_Error {
		if ( OutlookSettings::verify_key( $key, $settings ) ) {
			return null;
		}
		try {
			$this->rate_limiter->check_subject( 'outlook_auth_fail', $ip, self::AUTH_FAIL_MAX, self::AUTH_FAIL_WINDOW );
		} catch ( RateLimitException $e ) {
			return $this->exception_to_wp_error( $e );
		}
		return new \WP_Error(
			'imgsig_outlook_unauthorized',
			__( 'Missing or invalid deployment key.', 'imagina-signatures' ),
			[ 'status' => 401 ]
		);
	}

	/**
	 * The same 404 for "disabled", "unknown address" and "no deployable
	 * signature", so the endpoint reveals nothing more.
	 *
	 * @return \WP_Error
	 */
	private static function not_available(): \WP_Error {
		return new \WP_Error(
			'imgsig_outlook_not_found',
			__( 'No signature available.', 'imagina-signatures' ),
			[ 'status' => 404 ]
		);
	}

	/**
	 * Deployment key from the request header.
	 *
	 * @param \WP_REST_Request $request Request.
	 *
	 * @return string
	 */
	private function header_key( \WP_REST_Request $request ): string {
		$value = $request->get_header( OutlookCors::KEY_HEADER );
		return is_string( $value ) ? trim( $value ) : '';
	}

	/**
	 * Client IP used for the per-IP windows. `REMOTE_ADDR` only — proxy
	 * headers are spoofable; sites behind a trusted reverse proxy /
	 * CDN can map them with `imgsig/outlook/client_ip`.
	 *
	 * @return string
	 */
	private function client_ip(): string {
		// phpcs:ignore WordPressVIPMinimum.Variables.ServerVariables.UserControlledHeaders, WordPressVIPMinimum.Variables.RestrictedVariables.cache_constraints___SERVER__REMOTE_ADDR__
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( (string) $_SERVER['REMOTE_ADDR'] ) ) : '';

		/**
		 * Filters the client IP the Outlook endpoints rate-limit by.
		 *
		 * @since 1.3.0
		 *
		 * @param string $ip `REMOTE_ADDR`.
		 */
		$ip = (string) apply_filters( 'imgsig/outlook/client_ip', $ip );

		return '' !== $ip ? $ip : 'unknown';
	}

	/**
	 * True when every URL uses https.
	 *
	 * @param string[] $urls URLs.
	 *
	 * @return bool
	 */
	private static function all_https( array $urls ): bool {
		foreach ( $urls as $url ) {
			if ( 0 !== stripos( $url, 'https://' ) ) {
				return false;
			}
		}
		return true;
	}
}
