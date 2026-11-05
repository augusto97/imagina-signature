<?php
/**
 * Unit tests for the install-link REST endpoints.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\InstallController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Deployment\Install\InstallService;
use ImaginaSignatures\Deployment\Install\InstallTokens;
use ImaginaSignatures\Exceptions\RateLimitException;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DeploymentStubs.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\InstallController
 */
final class InstallControllerTest extends TestCase {

	use DeploymentStubs;

	private string $token;

	private ?Signature $primary = null;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_wordpress();

		$this->token   = str_repeat( 'a1', 32 );
		$this->primary = self::signature( 9 );
		$this->add_user( 9 );
		$this->meta[9][ InstallTokens::META_KEY ] = $this->token;

		Functions\when( 'get_users' )->alias(
			function ( array $args ): array {
				$out = [];
				foreach ( $this->meta as $id => $meta ) {
					if ( ( $meta[ $args['meta_key'] ] ?? null ) === $args['meta_value'] ) {
						$out[] = $id;
					}
				}
				return $out;
			}
		);
		Functions\when( 'rest_ensure_response' )->alias(
			static function ( $data ) {
				return $data instanceof \WP_REST_Response ? $data : new \WP_REST_Response( $data );
			}
		);
		Functions\when( 'sanitize_text_field' )->alias( 'trim' );
		Functions\when( 'wp_unslash' )->returnArg( 1 );
		Functions\when( 'home_url' )->alias(
			static function ( $path = '' ): string {
				return 'https://example.com' . $path;
			}
		);
		Functions\when( 'esc_url_raw' )->returnArg( 1 );
		Functions\when( 'get_current_user_id' )->justReturn( 9 );
		$this->options['permalink_structure'] = '/%postname%/';
		$_SERVER['REMOTE_ADDR']               = '203.0.113.7';
	}

	protected function tearDown(): void {
		unset( $_SERVER['REMOTE_ADDR'] );
		Monkey\tearDown();
		parent::tearDown();
	}

	private function controller( ?RateLimiter $limiter = null ): InstallController {
		$signatures = $this->createMock( SignatureService::class );
		$signatures->method( 'primary_for_user' )->willReturnCallback(
			function (): ?Signature {
				return $this->primary;
			}
		);
		return new InstallController( new InstallService( $signatures ), $limiter ?? $this->createMock( RateLimiter::class ) );
	}

	private function request( string $token, array $body = [] ): \WP_REST_Request {
		return new \WP_REST_Request( [ 'token' => $token ] + $body );
	}

	public function test_permission_requires_a_valid_token_and_rate_limits_by_ip_first(): void {
		$limiter = $this->createMock( RateLimiter::class );
		$limiter->expects( $this->exactly( 2 ) )
			->method( 'check_site' )
			->with( $this->stringStartsWith( 'install_ip_' ), 60, HOUR_IN_SECONDS );
		$controller = $this->controller( $limiter );

		$denied = $controller->check_token( $this->request( str_repeat( 'b', 64 ) ) );
		$this->assertInstanceOf( \WP_Error::class, $denied );
		$this->assertSame( 404, $denied->get_error_data()['status'] );

		$this->assertTrue( $controller->check_token( $this->request( $this->token ) ) );
	}

	public function test_permission_returns_429_when_the_ip_bucket_is_full(): void {
		$limiter = $this->createMock( RateLimiter::class );
		$limiter->method( 'check_site' )->willThrowException( new RateLimitException( 'slow down', 120 ) );

		$result = $this->controller( $limiter )->check_token( $this->request( $this->token ) );
		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 429, $result->get_error_data()['status'] );
	}

	public function test_permission_denies_tokens_of_users_who_lost_access(): void {
		$this->caps[9] = [];
		$this->assertInstanceOf( \WP_Error::class, $this->controller()->check_token( $this->request( $this->token ) ) );
	}

	public function test_installed_records_the_status_for_the_token_owner(): void {
		$limiter = $this->createMock( RateLimiter::class );
		$limiter->expects( $this->once() )->method( 'check' )->with( 'install_installed', 9, 10, HOUR_IN_SECONDS );

		$response = $this->controller( $limiter )->installed( $this->request( $this->token, [ 'client' => 'outlook-web' ] ) );

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertTrue( $response->get_data()['installed'] );
		$record = $this->meta[9]['imgsig_deploy_status']['install'];
		$this->assertSame( $this->primary->html_hash, $record['hash'] );
		$this->assertSame( 'outlook-web', $record['client'] );
		$this->assertSame( $record['installed_at'], $response->get_data()['installed_at'] );
		$this->assertSame( InstallService::STATE_INSTALLED, InstallService::state( $record, $this->primary->html_hash ) );
	}

	public function test_installed_accepts_outdated_html_that_the_page_served(): void {
		$this->primary = self::signature( 9, false );
		$response      = $this->controller()->installed( $this->request( $this->token ) );

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertSame( $this->primary->html_hash, $this->meta[9]['imgsig_deploy_status']['install']['hash'] );
	}

	public function test_installed_refuses_while_the_signature_is_not_ready(): void {
		$this->primary = self::never_compiled( 9 );
		$response      = $this->controller()->installed( $this->request( $this->token ) );

		$this->assertInstanceOf( \WP_Error::class, $response );
		$this->assertSame( 409, $response->get_error_data()['status'] );
		$this->assertArrayNotHasKey( 'imgsig_deploy_status', $this->meta[9] );
	}

	public function test_installed_is_rate_limited_per_owner(): void {
		$limiter = $this->createMock( RateLimiter::class );
		$limiter->method( 'check' )->willThrowException( new RateLimitException( 'slow down', 60 ) );

		$response = $this->controller( $limiter )->installed( $this->request( $this->token ) );
		$this->assertInstanceOf( \WP_Error::class, $response );
		$this->assertSame( 429, $response->get_error_data()['status'] );
		$this->assertArrayNotHasKey( 'imgsig_deploy_status', $this->meta[9] );
	}

	public function test_installed_never_trusts_a_user_id_from_the_body(): void {
		$this->add_user( 10 );
		$response = $this->controller()->installed( $this->request( str_repeat( 'b', 64 ), [ 'user_id' => 10 ] ) );
		$this->assertInstanceOf( \WP_Error::class, $response );
		$this->assertArrayNotHasKey( 10, $this->meta );
	}

	public function test_my_link_creates_the_token_on_first_use(): void {
		unset( $this->meta[9][ InstallTokens::META_KEY ] );
		$data = $this->controller()->my_link()->get_data();

		$token = $this->meta[9][ InstallTokens::META_KEY ];
		$this->assertTrue( InstallTokens::is_well_formed( $token ) );
		$this->assertSame( 'https://example.com/signatures/install/' . $token . '/', $data['url'] );
		$this->assertTrue( $data['ready'] );
		$this->assertSame( 'none', $data['state'] );

		$this->assertSame( $data['url'], $this->controller()->my_link()->get_data()['url'] );
	}

	public function test_regenerate_rotates_the_link(): void {
		$before = $this->controller()->my_link()->get_data()['url'];
		$after  = $this->controller()->regenerate_my_link()->get_data()['url'];
		$this->assertNotSame( $before, $after );
		$this->assertSame( 0, InstallTokens::resolve_user_id( $this->token ) );
	}

	public function test_team_endpoints_404_for_unknown_users(): void {
		$result = $this->controller()->user_link( new \WP_REST_Request( [ 'user_id' => 999 ] ) );
		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 404, $result->get_error_data()['status'] );

		$ok = $this->controller()->regenerate_user_link( new \WP_REST_Request( [ 'user_id' => 9 ] ) );
		$this->assertInstanceOf( \WP_REST_Response::class, $ok );
		$this->assertSame( 9, $ok->get_data()['user_id'] );
	}
}
