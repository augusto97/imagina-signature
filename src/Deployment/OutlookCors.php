<?php
/**
 * CORS policy of the public Outlook add-in routes.
 *
 * @package ImaginaSignatures\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment;

defined( 'ABSPATH' ) || exit;

/**
 * Cross-origin rules for `GET /outlook/signature` and
 * `GET /outlook/manifest.xml`.
 *
 * Who calls them:
 *
 *  - Outlook on the web / new Outlook / Mac / mobile run the add-in's
 *    HTML runtime from this site, so their requests are same-origin —
 *    or, inside some hosts, come from an Outlook origin
 *    ({@see ALLOWED_ORIGINS});
 *  - classic Outlook on Windows runs `launchevent.js` in a
 *    JavaScript-only runtime that sends `Origin: null` or no Origin.
 *
 * The deployment key — not CORS — is what protects the data, so the
 * policy is deliberately simple:
 *
 *  - an allowed origin (Outlook's, this site's, or one added through
 *    `imgsig/outlook/cors_origins`) is echoed back;
 *  - `Origin: null` is answered with `null`;
 *  - no Origin → `*` (not a CORS request; harmless without credentials);
 *  - any other origin gets no `Access-Control-Allow-Origin` at all.
 *
 * Credentials are never allowed (the add-in sends no cookies), and
 * WordPress core's blanket `rest_send_cors_headers()` — which echoes any
 * origin WITH `Access-Control-Allow-Credentials: true` — is overridden
 * for these routes. Preflights (`OPTIONS`) are answered by core's
 * `rest_handle_options_request()` and get the same headers;
 * `X-Imgsig-Deploy-Key` is added to the allowed request headers.
 *
 * @since 1.3.0
 */
final class OutlookCors {

	/** Request header that carries the deployment key. */
	public const KEY_HEADER = 'X-Imgsig-Deploy-Key';

	/**
	 * Outlook origins that may host the add-in runtime.
	 *
	 * @var string[]
	 */
	public const ALLOWED_ORIGINS = [
		'https://outlook.office.com',
		'https://outlook.office365.com',
		'https://outlook.live.com',
	];

	/** Route prefix (inside the plugin namespace) these rules apply to. */
	public const ROUTE_PREFIX = '/imagina-signatures/v1/outlook/';

	/**
	 * Hooks the policy into the REST server. Called from the
	 * controller's `register_routes()` (i.e. on `rest_api_init`).
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public static function register(): void {
		add_filter( 'rest_allowed_cors_headers', [ self::class, 'allow_key_header' ] );
		add_filter( 'rest_post_dispatch', [ self::class, 'decorate_response' ], 10, 3 );
		// After core's rest_send_cors_headers() (priority 10).
		add_filter( 'rest_pre_serve_request', [ self::class, 'send_headers' ], 20, 4 );
	}

	/**
	 * Whether a REST route is one of the public Outlook routes.
	 *
	 * @since 1.3.0
	 *
	 * @param string $route Route, e.g. `/imagina-signatures/v1/outlook/signature`.
	 *
	 * @return bool
	 */
	public static function is_outlook_route( string $route ): bool {
		return 0 === strpos( $route, self::ROUTE_PREFIX );
	}

	/**
	 * Origins allowed besides `null` / absent.
	 *
	 * @since 1.3.0
	 *
	 * @param string[] $own_origins This site's origins ({@see own_origins()}).
	 *
	 * @return string[]
	 */
	public static function allowed_origins( array $own_origins = [] ): array {
		$origins = array_merge( self::ALLOWED_ORIGINS, $own_origins );

		/**
		 * Filters the origins allowed to call the Outlook add-in routes.
		 *
		 * @since 1.3.0
		 *
		 * @param string[] $origins Exact origins (scheme://host[:port]).
		 */
		$origins = apply_filters( 'imgsig/outlook/cors_origins', $origins );

		$out = [];
		foreach ( (array) $origins as $origin ) {
			if ( is_string( $origin ) && '' !== $origin ) {
				$out[] = strtolower( rtrim( $origin, '/' ) );
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * The CORS headers for a request coming from `$origin`.
	 *
	 * An empty `Access-Control-Allow-Origin` value means "send none".
	 *
	 * @since 1.3.0
	 *
	 * @param string|null $origin      `Origin` header (null when absent).
	 * @param string[]    $own_origins This site's origins ({@see own_origins()}).
	 *
	 * @return array<string, string>
	 */
	public static function headers_for( ?string $origin, array $own_origins = [] ): array {
		$headers = [
			'Access-Control-Allow-Methods' => 'GET, OPTIONS',
			'Access-Control-Allow-Headers' => self::KEY_HEADER . ', Content-Type, Accept',
			'Access-Control-Max-Age'       => '600',
			'Vary'                         => 'Origin',
		];

		$origin = null === $origin ? null : trim( $origin );

		if ( null === $origin || '' === $origin ) {
			$headers['Access-Control-Allow-Origin'] = '*';
		} elseif ( 'null' === strtolower( $origin ) ) {
			$headers['Access-Control-Allow-Origin'] = 'null';
		} elseif ( in_array( strtolower( rtrim( $origin, '/' ) ), self::allowed_origins( $own_origins ), true ) ) {
			$headers['Access-Control-Allow-Origin'] = $origin;
		} else {
			$headers['Access-Control-Allow-Origin'] = '';
		}

		return $headers;
	}

	/**
	 * `scheme://host[:port]` of a URL ('' when it has no host).
	 *
	 * @since 1.3.0
	 *
	 * @param string $url Absolute URL.
	 *
	 * @return string
	 */
	public static function origin_of( string $url ): string {
		$scheme = (string) wp_parse_url( $url, PHP_URL_SCHEME );
		$host   = (string) wp_parse_url( $url, PHP_URL_HOST );
		$port   = wp_parse_url( $url, PHP_URL_PORT );
		if ( '' === $host ) {
			return '';
		}
		return strtolower( ( '' !== $scheme ? $scheme : 'https' ) . '://' . $host . ( null !== $port ? ':' . (int) $port : '' ) );
	}

	/**
	 * This site's origin (home URL).
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public static function site_origin(): string {
		return self::origin_of( home_url( '/' ) );
	}

	/**
	 * Origins the add-in is served from: the site, plus the plugin's
	 * asset origin when it differs (plugin URLs rewritten to a CDN) —
	 * the runtime page then lives there. Also the manifest's AppDomains.
	 *
	 * @since 1.3.0
	 *
	 * @return string[]
	 */
	public static function own_origins(): array {
		$origins = [
			self::site_origin(),
			self::origin_of( plugins_url( 'assets/outlook/', IMGSIG_FILE ) ),
		];
		return array_values( array_unique( array_filter( $origins ) ) );
	}

	/**
	 * `rest_allowed_cors_headers`: lets preflights carry the key header.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $headers Allowed request headers.
	 *
	 * @return array<int, string>
	 */
	public static function allow_key_header( $headers ): array {
		$headers = is_array( $headers ) ? $headers : [];
		if ( ! in_array( self::KEY_HEADER, $headers, true ) ) {
			$headers[] = self::KEY_HEADER;
		}
		return $headers;
	}

	/**
	 * `rest_post_dispatch`: stamps the CORS headers (and no-store
	 * caching) on every response of an Outlook route, including core's
	 * OPTIONS answer and error responses.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $result  Response.
	 * @param mixed $server  REST server (unused).
	 * @param mixed $request Request.
	 *
	 * @return mixed
	 */
	public static function decorate_response( $result, $server = null, $request = null ) {
		unset( $server );
		if ( ! $result instanceof \WP_REST_Response || ! $request instanceof \WP_REST_Request
			|| ! self::is_outlook_route( (string) $request->get_route() ) ) {
			return $result;
		}

		foreach ( self::headers_for( self::request_origin( $request ), self::own_origins() ) as $name => $value ) {
			if ( '' !== $value ) {
				$result->header( $name, $value );
			}
		}
		$result->header( 'Cache-Control', 'no-store, private' );

		return $result;
	}

	/**
	 * `rest_pre_serve_request` (after core's CORS filter): re-sends our
	 * headers so core's "echo any origin + credentials" doesn't win.
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
	public static function send_headers( $served, $result = null, $request = null, $server = null ) {
		unset( $result, $server );
		if ( ! $request instanceof \WP_REST_Request || ! self::is_outlook_route( (string) $request->get_route() ) || headers_sent() ) {
			return $served;
		}

		header_remove( 'Access-Control-Allow-Credentials' );
		foreach ( self::headers_for( self::request_origin( $request ), self::own_origins() ) as $name => $value ) {
			if ( 'Access-Control-Allow-Origin' === $name && '' === $value ) {
				header_remove( 'Access-Control-Allow-Origin' );
				continue;
			}
			// Vary adds to (never replaces) what other code already sent.
			header( $name . ': ' . $value, 'Vary' !== $name );
		}

		return $served;
	}

	/**
	 * The request's Origin header (null when absent).
	 *
	 * @param \WP_REST_Request $request Request.
	 *
	 * @return string|null
	 */
	private static function request_origin( \WP_REST_Request $request ): ?string {
		$origin = method_exists( $request, 'get_header' ) ? $request->get_header( 'origin' ) : null;
		return is_string( $origin ) ? $origin : null;
	}
}
