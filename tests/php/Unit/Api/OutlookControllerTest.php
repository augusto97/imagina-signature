<?php
/**
 * Unit tests for the Outlook add-in REST endpoints.
 *
 * @package ImaginaSignatures\Tests\Unit\Api
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Api;

use Brain\Monkey;
use Brain\Monkey\Filters;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\OutlookController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Deployment\OutlookCors;
use ImaginaSignatures\Deployment\OutlookSettings;
use ImaginaSignatures\Deployment\OutlookSignatureService;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Security\RateLimitStore;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Tests\Unit\Deployment\Imgsig_Outlook_Request;
use ImaginaSignatures\Tests\Unit\Deployment\OutlookStubs;
use Imgsig_Fake_Wpdb;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../Deployment/OutlookStubs.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\OutlookController
 * @covers \ImaginaSignatures\Deployment\OutlookCors
 * @covers \ImaginaSignatures\Api\Middleware\RateLimiter::check_subject
 * @covers \ImaginaSignatures\Security\RateLimitStore::subject_key
 */
final class OutlookControllerTest extends TestCase {

	use OutlookStubs;

	private const KEY   = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
	private const HTML  = '<table role="presentation"><tr><td>Ana</td></tr></table>';
	private const ROUTE = '/imagina-signatures/v1/outlook/signature';

	private Imgsig_Fake_Wpdb $db;

	/** @var array<string, int> Lowered limits, by action. */
	private array $limits = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_outlook_wp();

		$this->db                                = new Imgsig_Fake_Wpdb();
		$this->limits                            = [];
		$this->options['imgsig_schema_version']  = '1.3.0';
		$this->options[ OutlookSettings::OPTION ] = OutlookSettings::sanitize(
			[
				'enabled'    => true,
				'deploy_key' => self::KEY,
				'add_in_id'  => '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
			]
		);
		$_SERVER['REMOTE_ADDR']                  = '203.0.113.7';

		Functions\when( 'sanitize_key' )->alias(
			static function ( $key ): string {
				return (string) preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
			}
		);
		Functions\when( 'wp_using_ext_object_cache' )->justReturn( false );
		Functions\when( 'get_user_by' )->alias(
			static function ( $field, $value ) {
				return 'email' === $field && 'ana@acme.example' === strtolower( (string) $value )
					? new \WP_User(
						[
							'ID'         => 7,
							'user_email' => 'ana@acme.example',
						]
					)
					: false;
			}
		);
		Filters\expectApplied( 'imgsig/rate_limit/max' )->zeroOrMoreTimes()->andReturnUsing(
			function ( $max, $action ) {
				return $this->limits[ $action ] ?? $max;
			}
		);
	}

	protected function tearDown(): void {
		unset( $_SERVER['REMOTE_ADDR'] );
		Monkey\tearDown();
		parent::tearDown();
	}

	private function controller( ?Signature $primary = null ): OutlookController {
		$signatures = $this->createMock( SignatureService::class );
		$signatures->method( 'primary_for_user' )->willReturn(
			$primary ?? Signature::from_row(
				[
					'id'          => 3,
					'user_id'     => 7,
					'html_cache'  => self::HTML,
					'html_hash'   => 'h1',
					'compiled_at' => '2026-01-01 10:00:00',
					'updated_at'  => '2026-01-01 10:00:00',
				]
			)
		);

		$store = new RateLimitStore(
			$this->db,
			static function (): int {
				return 1767225600;
			}
		);
		return new OutlookController( new OutlookSignatureService( $signatures ), new RateLimiter( $store ) );
	}

	/**
	 * @param array<string, string> $headers Headers.
	 */
	private function signature_request( string $email, array $headers = [ 'X-Imgsig-Deploy-Key' => self::KEY ] ): Imgsig_Outlook_Request {
		return new Imgsig_Outlook_Request( 'GET', self::ROUTE, [ 'email' => $email ], $headers );
	}

	/**
	 * @param mixed $result Controller result.
	 */
	private function assert_error( $result, string $code, int $status ): void {
		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( $code, $result->get_error_code() );
		$this->assertSame( $status, $result->get_error_data()['status'] );
	}

	// ---------------------------------------------------------------------
	// GET /outlook/signature
	// ---------------------------------------------------------------------

	public function test_valid_key_returns_the_html_and_records_the_delivery(): void {
		$response = $this->controller()->signature( $this->signature_request( 'ANA@acme.example' ) );

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertSame( 200, $response->get_status() );
		$this->assertSame(
			[
				'html'                     => self::HTML,
				'hash'                     => 'h1',
				'replace_client_signature' => false,
			],
			$response->get_data()
		);
		$this->assertSame( 'h1', $this->meta[7]['imgsig_deploy_status']['outlook']['hash'] );
	}

	public function test_replace_client_signature_setting_is_returned(): void {
		OutlookSettings::update( [ 'replace_client_signature' => true ] );
		$response = $this->controller()->signature( $this->signature_request( 'ana@acme.example' ) );
		$this->assertTrue( $response->get_data()['replace_client_signature'] );
	}

	public function test_missing_or_wrong_key_is_401(): void {
		$controller = $this->controller();

		$this->assert_error( $controller->signature( $this->signature_request( 'ana@acme.example', [] ) ), 'imgsig_outlook_unauthorized', 401 );
		$this->assert_error(
			$controller->signature( $this->signature_request( 'ana@acme.example', [ 'X-Imgsig-Deploy-Key' => str_repeat( 'e', 64 ) ] ) ),
			'imgsig_outlook_unauthorized',
			401
		);
		// The key travels in the header, never in the query string.
		$query_key = new Imgsig_Outlook_Request(
			'GET',
			self::ROUTE,
			[
				'email' => 'ana@acme.example',
				'key'   => self::KEY,
			]
		);
		$this->assert_error( $controller->signature( $query_key ), 'imgsig_outlook_unauthorized', 401 );
		$this->assertSame( [], $this->meta, 'Nothing recorded for rejected calls.' );
	}

	public function test_header_name_is_case_insensitive(): void {
		$response = $this->controller()->signature( $this->signature_request( 'ana@acme.example', [ 'x-imgsig-deploy-key' => strtoupper( self::KEY ) ] ) );
		$this->assertSame( 200, $response->get_status() );
	}

	public function test_unknown_email_stale_html_and_disabled_all_answer_the_same_404(): void {
		$controller = $this->controller();
		$this->assert_error( $controller->signature( $this->signature_request( 'nobody@acme.example' ) ), 'imgsig_outlook_not_found', 404 );
		$this->assert_error( $controller->signature( $this->signature_request( '' ) ), 'imgsig_outlook_not_found', 404 );

		$stale = Signature::from_row(
			[
				'id'          => 3,
				'user_id'     => 7,
				'html_cache'  => self::HTML,
				'html_hash'   => 'h1',
				'compiled_at' => '2026-01-01 10:00:00',
				'updated_at'  => '2026-01-02 08:00:00',
			]
		);
		$this->assert_error( $this->controller( $stale )->signature( $this->signature_request( 'ana@acme.example' ) ), 'imgsig_outlook_not_found', 404 );

		OutlookSettings::update( [ 'enabled' => false ] );
		$this->assert_error( $controller->signature( $this->signature_request( 'ana@acme.example' ) ), 'imgsig_outlook_not_found', 404 );
	}

	public function test_requests_are_rate_limited_per_ip(): void {
		$this->limits['outlook_signature_ip'] = 2;
		$controller                           = $this->controller();

		$this->assertSame( 200, $controller->signature( $this->signature_request( 'ana@acme.example' ) )->get_status() );
		$this->assertSame( 200, $controller->signature( $this->signature_request( 'ana@acme.example' ) )->get_status() );

		$limited = $controller->signature( $this->signature_request( 'ana@acme.example' ) );
		$this->assert_error( $limited, 'imgsig_rate_limited', 429 );
		$this->assertGreaterThan( 0, $limited->get_error_data()['retry_after'] );

		// Another IP has its own window; raw IPs never reach the bucket key.
		$_SERVER['REMOTE_ADDR'] = '198.51.100.20';
		$this->assertSame( 200, $controller->signature( $this->signature_request( 'ana@acme.example' ) )->get_status() );
		foreach ( array_keys( $this->db->rows ) as $bucket ) {
			$this->assertStringNotContainsString( '203.0.113.7', $bucket );
			$this->assertStringNotContainsString( self::KEY, $bucket );
		}
	}

	public function test_requests_are_rate_limited_per_key(): void {
		$this->limits['outlook_signature_key'] = 1;
		$controller                            = $this->controller();

		$this->assertSame( 200, $controller->signature( $this->signature_request( 'ana@acme.example' ) )->get_status() );
		$_SERVER['REMOTE_ADDR'] = '198.51.100.20';
		$this->assert_error( $controller->signature( $this->signature_request( 'ana@acme.example' ) ), 'imgsig_rate_limited', 429 );
	}

	public function test_repeated_wrong_keys_from_one_ip_become_429(): void {
		$this->limits['outlook_auth_fail'] = 2;
		$controller                        = $this->controller();
		$wrong                             = [ 'X-Imgsig-Deploy-Key' => str_repeat( 'f', 64 ) ];

		$this->assert_error( $controller->signature( $this->signature_request( 'ana@acme.example', $wrong ) ), 'imgsig_outlook_unauthorized', 401 );
		$this->assert_error( $controller->signature( $this->signature_request( 'ana@acme.example', $wrong ) ), 'imgsig_outlook_unauthorized', 401 );
		$this->assert_error( $controller->signature( $this->signature_request( 'ana@acme.example', $wrong ) ), 'imgsig_rate_limited', 429 );

		// The right key still works from that IP.
		$this->assertSame( 200, $controller->signature( $this->signature_request( 'ana@acme.example' ) )->get_status() );
	}

	// ---------------------------------------------------------------------
	// GET /outlook/manifest.xml
	// ---------------------------------------------------------------------

	public function test_manifest_requires_the_key_and_is_served_as_xml(): void {
		$controller = $this->controller();
		$route      = '/imagina-signatures/v1/outlook/manifest.xml';

		$this->assert_error( $controller->manifest( new Imgsig_Outlook_Request( 'GET', $route ) ), 'imgsig_outlook_unauthorized', 401 );
		$this->assert_error(
			$controller->manifest( new Imgsig_Outlook_Request( 'GET', $route, [ 'key' => str_repeat( '0', 64 ) ] ) ),
			'imgsig_outlook_unauthorized',
			401
		);

		$response = $controller->manifest( new Imgsig_Outlook_Request( 'GET', $route, [ 'key' => self::KEY ] ) );
		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( 'text/xml; charset=utf-8', $response->headers['Content-Type'] );
		$this->assertArrayNotHasKey( 'Content-Disposition', $response->headers );
		$this->assertIsString( $response->get_data() );
		$doc = new \DOMDocument();
		$this->assertTrue( $doc->loadXML( $response->get_data() ) );
		$this->assertStringContainsString( 'key=' . self::KEY, $response->get_data() );

		$download = $controller->manifest(
			new Imgsig_Outlook_Request(
				'GET',
				'/imagina-signatures/v1/outlook/manifest',
				[
					'key'      => self::KEY,
					'download' => '1',
				]
			)
		);
		$this->assertStringContainsString( 'attachment; filename=', $download->headers['Content-Disposition'] );

		$by_header = $controller->manifest( new Imgsig_Outlook_Request( 'GET', $route, [], [ 'X-Imgsig-Deploy-Key' => self::KEY ] ) );
		$this->assertSame( 200, $by_header->get_status() );

		OutlookSettings::update( [ 'enabled' => false ] );
		$this->assert_error( $controller->manifest( new Imgsig_Outlook_Request( 'GET', $route, [ 'key' => self::KEY ] ) ), 'imgsig_outlook_not_found', 404 );
	}

	public function test_raw_xml_is_echoed_only_for_a_successful_manifest(): void {
		$request  = new Imgsig_Outlook_Request( 'GET', '/imagina-signatures/v1/outlook/manifest.xml' );
		$response = new \WP_REST_Response( '<OfficeApp/>', 200 );

		$this->expectOutputString( '<OfficeApp/>' );
		$this->assertTrue( OutlookController::serve_raw_xml( false, $response, $request ) );

		$error = new \WP_REST_Response( [ 'code' => 'imgsig_outlook_unauthorized' ], 401 );
		$this->assertFalse( OutlookController::serve_raw_xml( false, $error, $request ) );
		$other = new Imgsig_Outlook_Request( 'GET', self::ROUTE );
		$this->assertFalse( OutlookController::serve_raw_xml( false, new \WP_REST_Response( 'x', 200 ), $other ) );
	}

	// ---------------------------------------------------------------------
	// CORS
	// ---------------------------------------------------------------------

	public function test_cors_policy(): void {
		$site = 'https://acme.example';
		$own  = [ $site ];

		$outlook = OutlookCors::headers_for( 'https://outlook.office.com', $own );
		$this->assertSame( 'https://outlook.office.com', $outlook['Access-Control-Allow-Origin'] );
		$this->assertSame( 'GET, OPTIONS', $outlook['Access-Control-Allow-Methods'] );
		$this->assertStringContainsString( 'X-Imgsig-Deploy-Key', $outlook['Access-Control-Allow-Headers'] );
		$this->assertSame( 'Origin', $outlook['Vary'] );
		$this->assertArrayNotHasKey( 'Access-Control-Allow-Credentials', $outlook );

		$this->assertSame( 'https://outlook.office365.com', OutlookCors::headers_for( 'https://outlook.office365.com', $own )['Access-Control-Allow-Origin'] );
		$this->assertSame( 'https://outlook.live.com', OutlookCors::headers_for( 'https://outlook.live.com', $own )['Access-Control-Allow-Origin'] );
		$this->assertSame( $site, OutlookCors::headers_for( $site, $own )['Access-Control-Allow-Origin'] );
		$this->assertSame( 'null', OutlookCors::headers_for( 'null', $own )['Access-Control-Allow-Origin'], 'Office desktop runtime.' );
		$this->assertSame( '*', OutlookCors::headers_for( null, $own )['Access-Control-Allow-Origin'], 'No Origin header.' );
		$this->assertSame( '', OutlookCors::headers_for( 'https://evil.example', $own )['Access-Control-Allow-Origin'] );
		$this->assertSame( '', OutlookCors::headers_for( 'https://outlook.office.com.evil.example', $own )['Access-Control-Allow-Origin'] );
	}

	public function test_preflight_and_responses_of_outlook_routes_get_the_headers(): void {
		$preflight = new Imgsig_Outlook_Request( 'OPTIONS', self::ROUTE, [], [ 'Origin' => 'https://outlook.office.com' ] );
		$response  = OutlookCors::decorate_response( new \WP_REST_Response( [], 200 ), null, $preflight );

		$this->assertSame( 'https://outlook.office.com', $response->headers['Access-Control-Allow-Origin'] );
		$this->assertSame( 'GET, OPTIONS', $response->headers['Access-Control-Allow-Methods'] );
		$this->assertStringContainsString( 'X-Imgsig-Deploy-Key', $response->headers['Access-Control-Allow-Headers'] );
		$this->assertSame( 'no-store, private', $response->headers['Cache-Control'] );

		$evil     = new Imgsig_Outlook_Request( 'GET', self::ROUTE, [], [ 'Origin' => 'https://evil.example' ] );
		$no_allow = OutlookCors::decorate_response( new \WP_REST_Response( [], 401 ), null, $evil );
		$this->assertArrayNotHasKey( 'Access-Control-Allow-Origin', $no_allow->headers );

		$other     = new Imgsig_Outlook_Request( 'GET', '/imagina-signatures/v1/signatures', [], [ 'Origin' => 'https://outlook.office.com' ] );
		$untouched = OutlookCors::decorate_response( new \WP_REST_Response( [], 200 ), null, $other );
		$this->assertSame( [], $untouched->headers );

		$this->assertSame( [ 'Authorization', OutlookCors::KEY_HEADER ], OutlookCors::allow_key_header( [ 'Authorization' ] ) );
		$this->assertSame( [ OutlookCors::KEY_HEADER ], OutlookCors::allow_key_header( [ OutlookCors::KEY_HEADER ] ) );
	}

	public function test_routes_public_ones_open_admin_ones_gated_on_manage_team(): void {
		$routes = [];
		Functions\when( 'register_rest_route' )->alias(
			static function ( $namespace, $route, $args ) use ( &$routes ): bool {
				$routes[ $route ] = $args;
				return true;
			}
		);
		Functions\when( 'add_filter' )->justReturn( true );

		$this->controller()->register_routes();

		$this->assertSame( '__return_true', $routes['/outlook/signature'][0]['permission_callback'] );
		$this->assertSame( '__return_true', $routes['/outlook/manifest(?:\.xml)?'][0]['permission_callback'] );
		$this->assertSame( 1, preg_match( '@^/outlook/manifest(?:\.xml)?$@', '/outlook/manifest.xml' ) );

		Functions\when( 'is_user_logged_in' )->justReturn( true );
		$caps = [];
		Functions\when( 'current_user_can' )->alias(
			static function ( $cap ) use ( &$caps ): bool {
				$caps[] = $cap;
				return false;
			}
		);
		foreach ( [ '/admin/outlook', '/admin/outlook/regenerate-key' ] as $route ) {
			foreach ( $routes[ $route ] as $endpoint ) {
				$denied = ( $endpoint['permission_callback'] )();
				$this->assertInstanceOf( \WP_Error::class, $denied );
				$this->assertSame( 403, $denied->get_error_data()['status'] );
			}
		}
		$this->assertSame( [ 'imgsig_manage_team' ], array_values( array_unique( $caps ) ) );
	}

	// ---------------------------------------------------------------------
	// Admin
	// ---------------------------------------------------------------------

	public function test_admin_state_and_key_regeneration(): void {
		$controller = $this->controller();

		$state = $controller->show_settings()->get_data();
		$this->assertTrue( $state['enabled'] );
		$this->assertTrue( $state['https'] );
		$this->assertSame( '…dddddd', $state['key_preview'] );
		$this->assertSame( 'https://acme.example/wp-json/imagina-signatures/v1/outlook/manifest.xml?key=' . self::KEY, $state['manifest_url'] );
		$this->assertStringContainsString( 'download=1', $state['manifest_download_url'] );
		$this->assertSame( 'https://acme.example/.well-known/microsoft-officeaddins-allowed.json', $state['well_known_url'] );
		$this->assertTrue( $state['well_known_served'] );
		$this->assertSame(
			[ 'allowed' => [ 'https://acme.example/wp-content/plugins/imagina-signatures/assets/outlook/launchevent.js' ] ],
			$state['well_known_payload'],
			'The public allow-list never carries the key.'
		);

		$regenerated = $controller->regenerate_key()->get_data();
		$this->assertStringNotContainsString( self::KEY, $regenerated['manifest_url'] );
		$this->assertStringEndsWith( '.2', $regenerated['version'] );
		$this->assert_error(
			$controller->signature( $this->signature_request( 'ana@acme.example' ) ),
			'imgsig_outlook_unauthorized',
			401
		);
	}

	public function test_update_settings_and_https_detection(): void {
		$controller = $this->controller();

		$state = $controller->update_settings(
			new Imgsig_Outlook_Request(
				'POST',
				'/imagina-signatures/v1/admin/outlook',
				[
					'enabled'                  => false,
					'replace_client_signature' => true,
					'deploy_key'               => str_repeat( '1', 64 ),
				]
			)
		)->get_data();
		$this->assertFalse( $state['enabled'] );
		$this->assertTrue( $state['replace_client_signature'] );
		$this->assertSame( self::KEY, $this->options[ OutlookSettings::OPTION ]['deploy_key'], 'The key is never writable.' );

		$this->home = 'http://acme.example/blog/';
		$plain      = $controller->show_settings()->get_data();
		$this->assertFalse( $plain['https'] );
		$this->assertFalse( $plain['well_known_served'], 'Sub-directory installs cannot serve the origin root.' );
	}
}
