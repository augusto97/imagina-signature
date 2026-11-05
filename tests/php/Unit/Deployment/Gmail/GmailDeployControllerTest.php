<?php
/**
 * REST: settings, connection test, bulk push, status.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment\Gmail;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Api\Controllers\GmailDeployController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Deployment\DeploymentStatus;
use ImaginaSignatures\Deployment\Gmail\GmailApi;
use ImaginaSignatures\Deployment\Gmail\GmailPusher;
use ImaginaSignatures\Deployment\Gmail\GmailScheduler;
use ImaginaSignatures\Deployment\Gmail\GmailSettings;
use ImaginaSignatures\Deployment\Gmail\GmailTokenClient;
use ImaginaSignatures\Deployment\Gmail\GmailUserDirectory;
use ImaginaSignatures\Deployment\Gmail\PushResult;
use ImaginaSignatures\Exceptions\RateLimitException;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/GmailTestHarness.php';

/**
 * @covers \ImaginaSignatures\Api\Controllers\GmailDeployController
 */
final class GmailDeployControllerTest extends TestCase {

	use GmailTestHarness;

	/** @var array<int, array{0: int, 1: bool}> push_user() calls: [user_id, force]. */
	private array $pushes = [];

	/** @var int Owners reported by the mocked directory. */
	private int $owner_count = 0;

	/** @var array<int, Signature> */
	private array $primary = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->set_up_harness();
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'current_user_can' )->justReturn( true );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function controller( ?RateLimiter $limiter = null ): GmailDeployController {
		$settings = new GmailSettings( $this->encryption() );

		$pusher = $this->createMock( GmailPusher::class );
		$pusher->method( 'push_user' )->willReturnCallback(
			function ( int $user_id, bool $force = false ): PushResult {
				$this->pushes[] = [ $user_id, $force ];
				return new PushResult( $user_id, PushResult::PUSHED );
			}
		);

		$users = $this->createMock( GmailUserDirectory::class );
		$users->method( 'count_owners' )->willReturnCallback(
			function (): int {
				return $this->owner_count;
			}
		);
		$users->method( 'owner_ids_page' )->willReturnCallback(
			function ( int $offset, int $limit ): array {
				return array_slice( range( 1, max( 1, $this->owner_count ) ), $offset, $limit );
			}
		);

		$signatures = $this->createMock( SignatureService::class );
		$signatures->method( 'primary_for_user' )->willReturnCallback(
			function ( int $user_id ): ?Signature {
				return $this->primary[ $user_id ] ?? null;
			}
		);

		return new GmailDeployController(
			$settings,
			new GmailApi( new GmailTokenClient( $settings, $this->encryption() ), $settings ),
			$pusher,
			new GmailScheduler( $settings, $pusher, $users ),
			$users,
			$limiter ?? $this->createMock( RateLimiter::class ),
			$signatures
		);
	}

	/**
	 * @param array<string, mixed> $params Params.
	 */
	private function request( array $params = [] ): \WP_REST_Request {
		return new \WP_REST_Request( $params );
	}

	public function test_routes_require_manage_team(): void {
		$routes = [];
		Functions\when( 'register_rest_route' )->alias(
			static function ( $namespace, $route, $args ) use ( &$routes ): void {
				$routes[ $route ] = $args;
			}
		);
		$checked = [];
		Functions\when( 'current_user_can' )->alias(
			static function ( $cap ) use ( &$checked ): bool {
				$checked[] = $cap;
				return false;
			}
		);

		$this->controller()->register_routes();

		$this->assertSame(
			[ '/admin/deploy/gmail/settings', '/admin/deploy/gmail/test', '/admin/deploy/gmail/push', '/admin/deploy/gmail/status' ],
			array_keys( $routes )
		);
		foreach ( $routes as $endpoints ) {
			foreach ( $endpoints as $endpoint ) {
				$denied = ( $endpoint['permission_callback'] )();
				$this->assertInstanceOf( \WP_Error::class, $denied );
				$this->assertSame( 403, $denied->get_error_data()['status'] );
			}
		}
		$this->assertSame( [ 'imgsig_manage_team' ], array_values( array_unique( $checked ) ) );
	}

	public function test_saving_a_key_file_never_echoes_the_private_key(): void {
		$pem_body = trim( explode( "\n", self::key_pair()['private'] )[1] );

		$response = $this->controller()->update_settings(
			$this->request(
				[
					'service_account' => (string) json_encode( $this->service_account() ),
					'domains'         => 'acme.com, acme.co',
					'auto_push'       => true,
					'daily_sync'      => 'true',
				]
			)
		);

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertTrue( $data['configured'] );
		$this->assertTrue( $data['ready'] );
		$this->assertSame( 'pusher@acme-signatures.iam.gserviceaccount.com', $data['client_email'] );
		$this->assertSame( '112233445566778899001', $data['client_id'] );
		$this->assertSame( 'acme-signatures', $data['project_id'] );
		$this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $data['key_fingerprint'] );
		$this->assertSame( [ 'acme.com', 'acme.co' ], $data['domains'] );
		$this->assertTrue( $data['auto_push'] );
		$this->assertTrue( $data['daily_sync'] );
		$this->assertSame( GmailSettings::SCOPE, $data['scope'] );
		$this->assertArrayNotHasKey( 'private_key', $data );
		$this->assertStringNotContainsString( $pem_body, (string) json_encode( $data ) );
		$this->assertStringNotContainsString( 'PRIVATE KEY', (string) json_encode( $data ) );

		// GET agrees and still leaks nothing.
		$shown = $this->controller()->show_settings()->get_data();
		$this->assertStringNotContainsString( $pem_body, (string) json_encode( $shown ) );
		$this->assertStringNotContainsString( $this->options[ GmailSettings::OPTION ]['private_key'], (string) json_encode( $shown ) );
		$this->assertNotNull( $shown['next_daily_sync'], 'daily sync scheduled on save' );
		$this->assertSame( 'acme.com', $shown['domain_hint'] );
	}

	public function test_invalid_key_file_is_a_400_and_nothing_is_saved(): void {
		$response = $this->controller()->update_settings(
			$this->request(
				[
					'service_account' => '{"type":"authorized_user"}',
					'domains'         => [ 'acme.com' ],
				]
			)
		);

		$this->assertInstanceOf( \WP_Error::class, $response );
		$this->assertSame( 'imgsig_validation_failed', $response->get_error_code() );
		$this->assertSame( 400, $response->get_error_data()['status'] );
		$this->assertSame( 'type', $response->get_error_data()['errors'][0]['path'] );
		$this->assertArrayNotHasKey( GmailSettings::OPTION, $this->options );
	}

	public function test_invalid_domain_blocks_an_otherwise_valid_save(): void {
		$response = $this->controller()->update_settings(
			$this->request(
				[
					'service_account' => $this->service_account(),
					'domains'         => [ 'acme.com', 'gmail.com' ],
				]
			)
		);

		$this->assertInstanceOf( \WP_Error::class, $response );
		$this->assertSame( 'domains.1', $response->get_error_data()['errors'][0]['path'] );
		$this->assertArrayNotHasKey( GmailSettings::OPTION, $this->options );
	}

	public function test_toggles_alone_keep_the_stored_key(): void {
		$this->configured_settings();
		$key = $this->options[ GmailSettings::OPTION ]['private_key'];

		$data = $this->controller()->update_settings( $this->request( [ 'push_aliases' => true ] ) )->get_data();

		$this->assertTrue( $data['configured'] );
		$this->assertTrue( $data['push_aliases'] );
		$this->assertSame( $key, $this->options[ GmailSettings::OPTION ]['private_key'] );
	}

	public function test_delete_forgets_the_key_and_drops_pending_pushes(): void {
		$this->configured_settings(
			[
				'auto_push'  => true,
				'daily_sync' => true,
			]
		);
		$this->cron[] = [
			'hook'       => GmailScheduler::PUSH_HOOK,
			'timestamp'  => time() + 60,
			'args'       => [ 5 ],
			'recurrence' => '',
		];
		$this->cron[] = [
			'hook'       => GmailScheduler::DAILY_HOOK,
			'timestamp'  => time() + 60,
			'args'       => [],
			'recurrence' => 'daily',
		];

		$data = $this->controller()->forget_settings()->get_data();

		$this->assertFalse( $data['configured'] );
		$this->assertSame( '', $data['client_email'] );
		$this->assertSame( [ 'acme.com' ], $data['domains'] );
		$this->assertSame( [], $this->cron );
	}

	public function test_connection_test_lists_send_as_addresses(): void {
		$this->configured_settings();
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::token_ok(),
				'GET https://gmail.googleapis.com/'        => self::http_response(
					200,
					[
						'sendAs' => [
							[
								'sendAsEmail' => 'ana@acme.com',
								'isPrimary'   => true,
							],
						],
					]
				),
			]
		);
		// A cached token must not hide a delegation change: the test always asks for a fresh one.
		$this->transients['imgsig_gmail_tok_cached'] = [
			'value' => 'x',
			'ttl'   => 60,
		];

		$data = $this->controller()->test( $this->request( [ 'email' => ' Ana@ACME.com ' ] ) )->get_data();

		$this->assertTrue( $data['success'] );
		$this->assertSame( 'ana@acme.com', $data['email'] );
		$this->assertSame( 'ana@acme.com', $data['send_as'][0]['email'] );
		$this->assertCount( 1, $this->requests_to( 'https://oauth2.googleapis.com/token' ) );
	}

	public function test_connection_test_diagnoses_missing_delegation(): void {
		$this->configured_settings();
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::http_response(
					401,
					[
						'error'             => 'unauthorized_client',
						'error_description' => 'Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.',
					]
				),
			]
		);

		$data = $this->controller()->test( $this->request( [ 'email' => 'ana@acme.com' ] ) )->get_data();

		$this->assertFalse( $data['success'] );
		$this->assertSame( 'delegation_missing', $data['code'] );
		$this->assertStringContainsString( '112233445566778899001', $data['message'] );
		$this->assertStringContainsString( 'unauthorized_client', $data['google'] );
		$this->assertStringStartsWith( 'https://admin.google.com/', $data['help_url'] );
	}

	public function test_connection_test_diagnoses_api_disabled(): void {
		$this->configured_settings();
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::token_ok(),
				'GET https://gmail.googleapis.com/'        => self::http_response(
					403,
					[
						'error' => [
							'code'    => 403,
							'message' => 'Gmail API has not been used in project 123 before or it is disabled.',
							'status'  => 'PERMISSION_DENIED',
							'details' => [ [ 'reason' => 'SERVICE_DISABLED' ] ],
						],
					]
				),
			]
		);

		$data = $this->controller()->test( $this->request( [ 'email' => 'ana@acme.com' ] ) )->get_data();

		$this->assertFalse( $data['success'] );
		$this->assertSame( 'api_disabled', $data['code'] );
		$this->assertSame( 403, $data['http_status'] );
	}

	public function test_connection_test_refuses_addresses_outside_the_domains_without_calling_google(): void {
		$this->configured_settings();

		$data = $this->controller()->test( $this->request( [ 'email' => 'ana@elsewhere.org' ] ) )->get_data();

		$this->assertFalse( $data['success'] );
		$this->assertSame( 'domain_not_allowed', $data['code'] );
		$this->assertSame( [], $this->http_requests );
	}

	public function test_connection_test_validates_the_email_and_configuration(): void {
		$invalid = $this->controller()->test( $this->request( [ 'email' => 'nope' ] ) );
		$this->assertInstanceOf( \WP_Error::class, $invalid );
		$this->assertSame( 400, $invalid->get_error_data()['status'] );

		$data = $this->controller()->test( $this->request( [ 'email' => 'ana@acme.com' ] ) )->get_data();
		$this->assertFalse( $data['success'] );
		$this->assertSame( 'not_configured', $data['code'] );
	}

	public function test_bulk_push_processes_20_users_per_call(): void {
		$this->configured_settings();
		$controller = $this->controller();
		$ids        = range( 1, 45 );

		$first = $controller->push( $this->request( [ 'user_ids' => $ids ] ) )->get_data();
		$this->assertCount( 20, $first['results'] );
		$this->assertSame( 20, $first['next_offset'] );
		$this->assertSame( 45, $first['total'] );
		$this->assertSame( [ 'user_id', 'status', 'email', 'name', 'message', 'send_as' ], array_keys( $first['results'][0] ) );

		$second = $controller->push( $this->request( [ 'user_ids' => $ids, 'offset' => 20 ] ) )->get_data();
		$this->assertSame( 40, $second['next_offset'] );

		$last = $controller->push(
			$this->request(
				[
					'user_ids' => $ids,
					'offset'   => 40,
					'force'    => true,
				]
			)
		)->get_data();
		$this->assertCount( 5, $last['results'] );
		$this->assertNull( $last['next_offset'] );
		$this->assertSame( 45, $last['processed'] );

		$this->assertSame( $ids, array_column( $this->pushes, 0 ) );
		$this->assertSame( [ false, true ], array_values( array_unique( array_column( $this->pushes, 1 ) ) ) );
	}

	public function test_bulk_push_accepts_comma_separated_ids_and_dedupes(): void {
		$this->configured_settings();

		$data = $this->controller()->push( $this->request( [ 'user_ids' => '3,3,4,-1,abc' ] ) )->get_data();

		$this->assertSame( [ 3, 4 ], array_column( $data['results'], 'user_id' ) );
		$this->assertNull( $data['next_offset'] );
	}

	public function test_bulk_push_all_pages_through_signature_owners(): void {
		$this->configured_settings();
		$this->owner_count = 20;
		$controller        = $this->controller();

		$first = $controller->push( $this->request( [ 'all' => true ] ) )->get_data();
		$this->assertCount( 20, $first['results'] );
		$this->assertNull( $first['next_offset'], 'exactly one full page' );

		$this->owner_count = 41;
		$this->pushes      = [];
		$offset            = 0;
		$calls             = 0;
		do {
			$page   = $controller->push(
				$this->request(
					[
						'all'    => true,
						'offset' => $offset,
					]
				)
			)->get_data();
			$offset = $page['next_offset'];
			++$calls;
		} while ( null !== $offset && $calls < 10 );

		$this->assertSame( 3, $calls );
		$this->assertSame( range( 1, 41 ), array_column( $this->pushes, 0 ) );
	}

	public function test_bulk_push_needs_users_and_a_connection(): void {
		$not_configured = $this->controller()->push( $this->request( [ 'all' => true ] ) );
		$this->assertSame( 'imgsig_gmail_not_configured', $not_configured->get_error_code() );

		$this->configured_settings();
		$no_users = $this->controller()->push( $this->request( [] ) );
		$this->assertSame( 'imgsig_gmail_no_users', $no_users->get_error_code() );
		$this->assertSame( [], $this->pushes );
	}

	public function test_bulk_push_is_rate_limited(): void {
		$this->configured_settings();
		$limiter = $this->createMock( RateLimiter::class );
		$limiter->method( 'check' )->willThrowException( new RateLimitException( 'Too many requests.', 120 ) );

		$response = $this->controller( $limiter )->push( $this->request( [ 'all' => true ] ) );

		$this->assertSame( 'imgsig_rate_limited', $response->get_error_code() );
		$this->assertSame( 120, $response->get_error_data()['retry_after'] );
	}

	public function test_status_returns_gmail_records_with_freshness(): void {
		$html = '<p>v1</p>';
		DeploymentStatus::set(
			5,
			'gmail',
			[
				'at'    => '2026-11-05 10:00:00',
				'hash'  => hash( 'sha256', $html ),
				'error' => null,
			]
		);
		$this->primary[5] = Signature::from_row(
			[
				'id'          => 1,
				'user_id'     => 5,
				'html_cache'  => $html,
				'html_hash'   => hash( 'sha256', $html ),
				'compiled_at' => '2026-11-05 10:00:00',
				'updated_at'  => '2026-11-05 10:00:00',
			]
		);
		$this->primary[6] = Signature::from_row(
			[
				'id'          => 2,
				'user_id'     => 6,
				'html_cache'  => $html,
				'compiled_at' => '2026-11-05 09:00:00',
				'updated_at'  => '2026-11-05 10:00:00',
			]
		);

		$items = $this->controller()->status( $this->request( [ 'user_ids' => [ 5, 6, 7 ] ] ) )->get_data()['items'];

		$this->assertSame( [ 5, 6, 7 ], array_column( $items, 'user_id' ) );
		$this->assertTrue( $items[0]['up_to_date'] );
		$this->assertSame( '2026-11-05 10:00:00', $items[0]['gmail']['at'] );
		$this->assertTrue( $items[1]['needs_recompile'] );
		$this->assertFalse( $items[1]['up_to_date'] );
		$this->assertNull( $items[1]['gmail'] );
		$this->assertNull( $items[2]['current_hash'] );
		$this->assertFalse( $items[2]['needs_recompile'] );

		$this->assertInstanceOf( \WP_Error::class, $this->controller()->status( $this->request( [] ) ) );
	}
}
