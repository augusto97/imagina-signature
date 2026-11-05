<?php
/**
 * Push skip rules, recording and error handling.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment\Gmail;

use Brain\Monkey;
use Brain\Monkey\Filters;
use ImaginaSignatures\Deployment\DeploymentStatus;
use ImaginaSignatures\Deployment\Gmail\GmailApi;
use ImaginaSignatures\Deployment\Gmail\GmailException;
use ImaginaSignatures\Deployment\Gmail\GmailPusher;
use ImaginaSignatures\Deployment\Gmail\GmailSettings;
use ImaginaSignatures\Deployment\Gmail\GmailTokenClient;
use ImaginaSignatures\Deployment\Gmail\PushResult;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Services\SignatureService;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/GmailTestHarness.php';

/**
 * @covers \ImaginaSignatures\Deployment\Gmail\GmailPusher
 * @covers \ImaginaSignatures\Deployment\Gmail\PushResult
 */
final class GmailPusherTest extends TestCase {

	use GmailTestHarness;

	private const HTML = '<table role="presentation"><tr><td>Ana Ruiz · CEO</td></tr></table>';

	/** @var array<int, Signature|null> */
	private array $primary = [];

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->set_up_harness();
		$this->add_user( 5, 'ana@acme.com', 'Ana Ruiz' );
		$this->primary = [ 5 => $this->signature() ];
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @param array<string, mixed> $overrides Row overrides.
	 */
	private function signature( array $overrides = [] ): Signature {
		return Signature::from_row(
			$overrides + [
				'id'          => 7,
				'user_id'     => 5,
				'name'        => 'Main',
				'html_cache'  => self::HTML,
				'html_hash'   => hash( 'sha256', self::HTML ),
				'compiled_at' => '2026-11-05 10:00:00',
				'updated_at'  => '2026-11-05 10:00:00',
				'status'      => 'ready',
			]
		);
	}

	/**
	 * @param array<string, mixed> $changes Settings.
	 */
	private function pusher( array $changes = [] ): GmailPusher {
		$settings   = $this->configured_settings( $changes );
		$signatures = $this->createMock( SignatureService::class );
		$signatures->method( 'primary_for_user' )->willReturnCallback(
			function ( int $user_id ): ?Signature {
				return $this->primary[ $user_id ] ?? null;
			}
		);
		return new GmailPusher( $settings, new GmailApi( new GmailTokenClient( $settings, $this->encryption() ), $settings ), $signatures );
	}

	private function gmail_ok(): void {
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::token_ok(),
				'PATCH https://gmail.googleapis.com/'      => self::http_response( 200, [] ),
				'GET https://gmail.googleapis.com/'        => self::http_response(
					200,
					[
						'sendAs' => [
							[
								'sendAsEmail' => 'ana@acme.com',
								'isPrimary'   => true,
							],
							[
								'sendAsEmail'        => 'sales@acme.com',
								'verificationStatus' => 'accepted',
							],
							[
								'sendAsEmail'        => 'pending@acme.com',
								'verificationStatus' => 'pending',
							],
							[
								'sendAsEmail'        => 'ana@other.org',
								'verificationStatus' => 'accepted',
							],
						],
					]
				),
			]
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	private function record( int $user_id = 5 ): array {
		return DeploymentStatus::get( $user_id )['gmail'] ?? [];
	}

	public function test_pushes_the_server_html_to_the_primary_send_as_and_records_it(): void {
		$this->gmail_ok();
		Monkey\Actions\expectDone( 'imgsig/gmail/push_completed' )->once();

		$result = $this->pusher()->push_user( 5 );

		$this->assertSame( PushResult::PUSHED, $result->status );
		$this->assertSame( [ 'ana@acme.com' ], $result->send_as );
		$patch = $this->requests_to( 'https://gmail.googleapis.com/' );
		$this->assertCount( 1, $patch );
		$this->assertStringEndsWith( '/users/ana%40acme.com/settings/sendAs/ana%40acme.com', $patch[0]['url'] );
		$this->assertSame( self::HTML, json_decode( $patch[0]['args']['body'], true )['signature'] );

		$record = $this->record();
		$this->assertSame( hash( 'sha256', self::HTML ), $record['hash'] );
		$this->assertNull( $record['error'] );
		$this->assertSame( 'pushed', $record['status'] );
		$this->assertMatchesRegularExpression( '/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', $record['at'] );
		$this->assertSame( 7, $record['signature_id'] );

		$wire = $result->to_array();
		$this->assertSame( 5, $wire['user_id'] );
		$this->assertSame( 'pushed', $wire['status'] );
		$this->assertSame( 'Ana Ruiz', $wire['name'] );
		$this->assertArrayNotHasKey( 'error', $wire );
	}

	public function test_aliases_toggle_adds_verified_aliases_in_allowed_domains_only(): void {
		$this->gmail_ok();

		$result = $this->pusher( [ 'push_aliases' => true ] )->push_user( 5 );

		$this->assertSame( [ 'ana@acme.com', 'sales@acme.com' ], $result->send_as );
		$this->assertCount( 2, $this->requests_to( 'https://gmail.googleapis.com/gmail/v1/users/ana%40acme.com/settings/sendAs/' ) );
	}

	public function test_skips_when_not_configured(): void {
		$signatures = $this->createMock( SignatureService::class );
		$settings   = new GmailSettings( $this->encryption() );
		$pusher     = new GmailPusher( $settings, new GmailApi( new GmailTokenClient( $settings, $this->encryption() ), $settings ), $signatures );

		$this->assertSame( PushResult::NOT_CONFIGURED, $pusher->push_user( 5 )->status );
		$this->assertSame( [], $this->http_requests );
	}

	public function test_skips_users_without_a_signature(): void {
		$this->primary = [];

		$result = $this->pusher()->push_user( 5 );

		$this->assertSame( PushResult::NO_SIGNATURE, $result->status );
		$this->assertFalse( $result->attempted() );
		$this->assertSame( [], $this->http_requests );
		$this->assertSame( 'no_signature', $this->record()['status'] );
	}

	/**
	 * @return array<string, array{0: array<string, mixed>}>
	 */
	public function stale_signatures(): array {
		return [
			'edited after compile' => [ [ 'updated_at' => '2026-11-05 10:00:01' ] ],
			'never compiled'       => [
				[
					'html_cache'  => null,
					'html_hash'   => null,
					'compiled_at' => null,
				],
			],
			'blank html'           => [ [ 'html_cache' => '   ' ] ],
		];
	}

	/**
	 * @dataProvider stale_signatures
	 *
	 * @param array<string, mixed> $overrides Row overrides.
	 */
	public function test_skips_stale_or_missing_html_as_needs_recompile( array $overrides ): void {
		$this->primary = [ 5 => $this->signature( $overrides ) ];

		$result = $this->pusher()->push_user( 5 );

		$this->assertSame( PushResult::NEEDS_RECOMPILE, $result->status );
		$this->assertStringContainsString( 'Needs recompile', $result->message );
		$this->assertSame( [], $this->http_requests );
	}

	public function test_skips_addresses_outside_the_allowed_domains(): void {
		$this->add_user( 6, 'bob@contractor.io' );
		$this->primary[6] = $this->signature( [ 'user_id' => 6 ] );

		$result = $this->pusher()->push_user( 6 );

		$this->assertSame( PushResult::DOMAIN_NOT_ALLOWED, $result->status );
		$this->assertStringContainsString( 'contractor.io', $result->message );
		$this->assertSame( [], $this->http_requests );
	}

	public function test_skips_users_without_a_valid_email_or_that_do_not_exist(): void {
		$this->add_user( 8, 'not-an-email' );
		$pusher = $this->pusher();

		$this->assertSame( PushResult::NO_EMAIL, $pusher->push_user( 8 )->status );
		$this->assertSame( PushResult::USER_NOT_FOUND, $pusher->push_user( 404 )->status );
		$this->assertSame( [], $this->http_requests );
	}

	public function test_user_email_filter_maps_to_the_workspace_address(): void {
		$this->add_user( 9, 'ana.personal@example.net' );
		$this->primary[9] = $this->signature( [ 'user_id' => 9 ] );
		Filters\expectApplied( 'imgsig/gmail/user_email' )->andReturn( 'ana@acme.com' );
		$this->gmail_ok();

		$this->assertSame( PushResult::PUSHED, $this->pusher()->push_user( 9 )->status );
	}

	public function test_same_hash_is_skipped_unless_forced(): void {
		$this->gmail_ok();
		$pusher = $this->pusher();

		$this->assertSame( PushResult::PUSHED, $pusher->push_user( 5 )->status );
		$this->assertSame( PushResult::UP_TO_DATE, $pusher->push_user( 5 )->status );
		$this->assertCount( 1, $this->requests_to( 'https://gmail.googleapis.com/' ) );

		$this->assertSame( PushResult::PUSHED, $pusher->push_user( 5, true )->status );
		$this->assertCount( 2, $this->requests_to( 'https://gmail.googleapis.com/' ) );

		// New HTML → pushed again without forcing.
		$this->primary = [
			5 => $this->signature(
				[
					'html_cache' => '<p>v2</p>',
					'html_hash'  => hash( 'sha256', '<p>v2</p>' ),
				]
			),
		];
		$this->assertSame( PushResult::PUSHED, $pusher->push_user( 5 )->status );
		$this->assertSame( hash( 'sha256', '<p>v2</p>' ), $this->record()['hash'] );
	}

	public function test_a_recorded_error_with_the_same_hash_is_retried(): void {
		DeploymentStatus::set(
			5,
			'gmail',
			[
				'hash'  => hash( 'sha256', self::HTML ),
				'error' => 'previous failure',
			]
		);
		$this->gmail_ok();

		$this->assertSame( PushResult::PUSHED, $this->pusher()->push_user( 5 )->status );
	}

	public function test_permanent_failure_is_recorded_and_keeps_the_deployed_hash(): void {
		DeploymentStatus::set(
			5,
			'gmail',
			[
				'at'   => '2026-11-01 00:00:00',
				'hash' => 'previously-deployed',
			]
		);
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::http_response(
					401,
					[
						'error'             => 'unauthorized_client',
						'error_description' => 'Client is unauthorized to retrieve access tokens using this method.',
					]
				),
			]
		);

		$result = $this->pusher()->push_user( 5 );

		$this->assertSame( PushResult::ERROR, $result->status );
		$this->assertFalse( $result->is_retryable() );
		$wire = $result->to_array();
		$this->assertSame( GmailException::DELEGATION_MISSING, $wire['error_code'] );
		$this->assertStringContainsString( 'unauthorized_client', $wire['google'] );

		$record = $this->record();
		$this->assertSame( 'previously-deployed', $record['hash'] );
		$this->assertSame( '2026-11-01 00:00:00', $record['at'] );
		$this->assertSame( 'error', $record['status'] );
		$this->assertSame( GmailException::DELEGATION_MISSING, $record['error_code'] );
		$this->assertNotEmpty( $record['error'] );
	}

	public function test_temporary_failures_count_retries(): void {
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::token_ok(),
				'PATCH https://gmail.googleapis.com/'      => self::http_response( 503, [ 'error' => [ 'message' => 'Backend Error' ] ], [ 'Retry-After' => '45' ] ),
			]
		);
		$pusher = $this->pusher();

		$first = $pusher->push_user( 5 );
		$this->assertSame( PushResult::RETRY, $first->status );
		$this->assertSame( 1, $first->retries );
		$this->assertNotNull( $first->exception );
		$this->assertSame( 45, $first->exception->retry_after() );

		$this->assertSame( 2, $pusher->push_user( 5 )->retries );
		$this->assertSame( 2, $this->record()['retries'] );
		$this->assertSame( 'retry', $this->record()['status'] );
	}

	public function test_signatures_longer_than_gmail_accepts_fail_before_any_call(): void {
		$long          = '<p>' . str_repeat( 'x', GmailPusher::MAX_SIGNATURE_LENGTH ) . '</p>';
		$this->primary = [
			5 => $this->signature(
				[
					'html_cache' => $long,
					'html_hash'  => hash( 'sha256', $long ),
				]
			),
		];

		$result = $this->pusher()->push_user( 5 );

		$this->assertSame( PushResult::ERROR, $result->status );
		$this->assertSame( GmailException::TOO_LONG, $result->to_array()['error_code'] );
		$this->assertSame( [], $this->http_requests );
	}

	public function test_unchanged_skip_is_not_rewritten(): void {
		$this->primary = [];
		$pusher        = $this->pusher();

		$pusher->push_user( 5 );
		$writes = $this->meta_writes;
		$pusher->push_user( 5 );

		$this->assertSame( $writes, $this->meta_writes );
	}
}
