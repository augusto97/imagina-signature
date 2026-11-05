<?php
/**
 * Google error → diagnosis mapping, and the Gmail API client.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment\Gmail;

use Brain\Monkey;
use ImaginaSignatures\Deployment\Gmail\GmailApi;
use ImaginaSignatures\Deployment\Gmail\GmailErrorMapper;
use ImaginaSignatures\Deployment\Gmail\GmailException;
use ImaginaSignatures\Deployment\Gmail\GmailTokenClient;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/GmailTestHarness.php';

/**
 * @covers \ImaginaSignatures\Deployment\Gmail\GmailErrorMapper
 * @covers \ImaginaSignatures\Deployment\Gmail\GmailApi
 * @covers \ImaginaSignatures\Deployment\Gmail\GmailException
 */
final class GmailErrorMappingTest extends TestCase {

	use GmailTestHarness;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->set_up_harness();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @return array<string, array{0: int, 1: array<string, string>, 2: string}>
	 */
	public function token_errors(): array {
		return [
			'delegation not granted' => [
				401,
				[
					'error'             => 'unauthorized_client',
					'error_description' => 'Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.',
				],
				GmailException::DELEGATION_MISSING,
			],
			'user outside domain'    => [
				400,
				[
					'error'             => 'invalid_grant',
					'error_description' => 'Invalid email or User ID',
				],
				GmailException::USER_NOT_FOUND,
			],
			'key deleted'            => [
				400,
				[
					'error'             => 'invalid_grant',
					'error_description' => 'Invalid JWT Signature.',
				],
				GmailException::INVALID_KEY,
			],
			'clock skew'             => [
				400,
				[
					'error'             => 'invalid_grant',
					'error_description' => 'Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe. Check your iat and exp values in the JWT claim.',
				],
				GmailException::CLOCK_SKEW,
			],
			'account deleted'        => [
				400,
				[
					'error'             => 'invalid_grant',
					'error_description' => 'Invalid grant: account not found',
				],
				GmailException::INVALID_CLIENT,
			],
			'client disabled'        => [
				401,
				[
					'error'             => 'disabled_client',
					'error_description' => 'The OAuth client was disabled.',
				],
				GmailException::INVALID_CLIENT,
			],
			'other'                  => [
				400,
				[ 'error' => 'invalid_request' ],
				GmailException::TOKEN_REFUSED,
			],
		];
	}

	/**
	 * @dataProvider token_errors
	 *
	 * @param int                   $status HTTP status.
	 * @param array<string, string> $body   Google body.
	 * @param string                $reason Expected diagnosis.
	 */
	public function test_token_errors_are_diagnosed( int $status, array $body, string $reason ): void {
		$e = GmailErrorMapper::from_token_response( $status, (string) json_encode( $body ), 0, '1122', 'ana@acme.com' );

		$this->assertSame( $reason, $e->reason() );
		$this->assertFalse( $e->is_retryable() );
		$this->assertSame( $status, $e->http_status() );
		$this->assertStringContainsString( $body['error'], $e->google_message() );
		$this->assertNotSame( '', $e->getMessage() );
	}

	public function test_token_rate_limit_and_outage_are_retryable(): void {
		$limited = GmailErrorMapper::from_token_response( 429, '{}', 30, '1', 'a@acme.com' );
		$this->assertSame( GmailException::RATE_LIMITED, $limited->reason() );
		$this->assertTrue( $limited->is_retryable() );
		$this->assertSame( 30, $limited->retry_after() );

		$outage = GmailErrorMapper::from_token_response( 503, '<html>Service Unavailable</html>', 0, '1', 'a@acme.com' );
		$this->assertSame( GmailException::SERVER_ERROR, $outage->reason() );
		$this->assertTrue( $outage->is_retryable() );
		$this->assertSame( 'Service Unavailable', $outage->google_message() );
	}

	/**
	 * @return array<string, array{0: int, 1: array<string, mixed>, 2: string, 3: bool}>
	 */
	public function api_errors(): array {
		$error = static function ( int $code, string $message, string $status, string $reason, string $detail = '' ): array {
			$body = [
				'error' => [
					'code'    => $code,
					'message' => $message,
					'status'  => $status,
					'errors'  => [
						[
							'message' => $message,
							'reason'  => $reason,
						],
					],
				],
			];
			if ( '' !== $detail ) {
				$body['error']['details'] = [
					[
						'@type'  => 'type.googleapis.com/google.rpc.ErrorInfo',
						'reason' => $detail,
					],
				];
			}
			return $body;
		};

		return [
			'api not enabled' => [
				403,
				$error( 403, 'Gmail API has not been used in project 123 before or it is disabled.', 'PERMISSION_DENIED', 'accessNotConfigured', 'SERVICE_DISABLED' ),
				GmailException::API_DISABLED,
				false,
			],
			'wrong scope'     => [
				403,
				$error( 403, 'Request had insufficient authentication scopes.', 'PERMISSION_DENIED', 'insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' ),
				GmailException::WRONG_SCOPE,
				false,
			],
			'quota 403'       => [
				403,
				$error( 403, 'User Rate Limit Exceeded', 'PERMISSION_DENIED', 'userRateLimitExceeded' ),
				GmailException::RATE_LIMITED,
				true,
			],
			'other 403'       => [
				403,
				$error( 403, 'Forbidden', 'PERMISSION_DENIED', 'forbidden' ),
				GmailException::FORBIDDEN,
				false,
			],
			'no mailbox'      => [
				400,
				$error( 400, 'Mail service not enabled', 'FAILED_PRECONDITION', 'failedPrecondition' ),
				GmailException::MAIL_DISABLED,
				false,
			],
			'too long'        => [
				400,
				$error( 400, 'Signature is too long', 'INVALID_ARGUMENT', 'invalidArgument' ),
				GmailException::TOO_LONG,
				false,
			],
			'not found'       => [
				404,
				$error( 404, 'Requested entity was not found.', 'NOT_FOUND', 'notFound' ),
				GmailException::SEND_AS_NOT_FOUND,
				false,
			],
			'rate limited'    => [
				429,
				$error( 429, 'Too many requests', 'RESOURCE_EXHAUSTED', 'rateLimitExceeded' ),
				GmailException::RATE_LIMITED,
				true,
			],
			'backend error'   => [
				500,
				$error( 500, 'Backend Error', 'INTERNAL', 'backendError' ),
				GmailException::SERVER_ERROR,
				true,
			],
			'401'             => [
				401,
				$error( 401, 'Invalid Credentials', 'UNAUTHENTICATED', 'authError' ),
				GmailException::UNAUTHORIZED,
				false,
			],
		];
	}

	/**
	 * @dataProvider api_errors
	 *
	 * @param int                  $status    HTTP status.
	 * @param array<string, mixed> $body      Google body.
	 * @param string               $reason    Expected diagnosis.
	 * @param bool                 $retryable Expected retryability.
	 */
	public function test_api_errors_are_diagnosed( int $status, array $body, string $reason, bool $retryable ): void {
		$e = GmailErrorMapper::from_api_response( $status, (string) json_encode( $body ), 0, 'ana@acme.com', 'acme-signatures' );

		$this->assertSame( $reason, $e->reason() );
		$this->assertSame( $retryable, $e->is_retryable() );
		$this->assertSame( $body['error']['message'], $e->google_message() );
	}

	public function test_api_disabled_links_to_the_project_library_page(): void {
		$e = GmailErrorMapper::from_api_response(
			403,
			(string) json_encode( [ 'error' => [ 'message' => 'Gmail API has not been used in project 123 before or it is disabled.' ] ] ),
			0,
			'ana@acme.com',
			'acme-signatures'
		);
		$this->assertSame( 'https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=acme-signatures', $e->help_url() );
		$this->assertStringContainsString( 'acme-signatures', $e->getMessage() );
	}

	public function test_retry_after_parsing(): void {
		$this->assertSame( 0, GmailErrorMapper::parse_retry_after( '' ) );
		$this->assertSame( 120, GmailErrorMapper::parse_retry_after( '120' ) );
		$this->assertSame( 7, GmailErrorMapper::parse_retry_after( [ '7' ] ) );
		$this->assertSame( DAY_IN_SECONDS, GmailErrorMapper::parse_retry_after( '999999' ) );
		$this->assertEqualsWithDelta( 60, GmailErrorMapper::parse_retry_after( gmdate( 'D, d M Y H:i:s', time() + 60 ) . ' GMT' ), 2 );
	}

	public function test_google_text_is_clipped(): void {
		$e = GmailErrorMapper::from_api_response( 400, (string) json_encode( [ 'error' => [ 'message' => str_repeat( 'x', 2000 ) ] ] ), 0, 'a@acme.com', '' );
		$this->assertSame( 500, strlen( $e->google_message() ) );
	}

	public function test_api_client_patches_the_send_as_signature_with_a_bearer_token(): void {
		$api = new GmailApi( new GmailTokenClient( $this->configured_settings(), $this->encryption() ), $this->configured_settings() );
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::token_ok( 'ya29.abc' ),
				'PATCH https://gmail.googleapis.com/'      => self::http_response( 200, [ 'sendAsEmail' => 'ana@acme.com' ] ),
			]
		);

		$api->update_signature( 'Ana@acme.com', 'Ana@acme.com', '<table><tr><td>Ana — “CEO”</td></tr></table>' );

		$patch = $this->requests_to( 'https://gmail.googleapis.com/' );
		$this->assertCount( 1, $patch );
		$this->assertSame( 'https://gmail.googleapis.com/gmail/v1/users/ana%40acme.com/settings/sendAs/ana%40acme.com', $patch[0]['url'] );
		$this->assertSame( 'PATCH', $patch[0]['args']['method'] );
		$this->assertSame( 'Bearer ya29.abc', $patch[0]['args']['headers']['Authorization'] );
		$this->assertSame( 0, $patch[0]['args']['redirection'] );
		$this->assertSame(
			[ 'signature' => '<table><tr><td>Ana — “CEO”</td></tr></table>' ],
			json_decode( $patch[0]['args']['body'], true )
		);
	}

	public function test_a_401_refreshes_the_token_once(): void {
		$settings = $this->configured_settings();
		$api      = new GmailApi( new GmailTokenClient( $settings, $this->encryption() ), $settings );
		$tokens   = 0;
		$patches  = 0;
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => static function () use ( &$tokens ): array {
					++$tokens;
					return self::http_response( 200, [ 'access_token' => 'ya29.t' . $tokens ] );
				},
				'PATCH https://gmail.googleapis.com/'      => static function ( array $args ) use ( &$patches ): array {
					++$patches;
					return 'Bearer ya29.t1' === $args['headers']['Authorization']
						? self::http_response( 401, [ 'error' => [ 'message' => 'Invalid Credentials' ] ] )
						: self::http_response( 200, [] );
				},
			]
		);

		$api->update_signature( 'ana@acme.com', 'ana@acme.com', '<p>x</p>' );

		$this->assertSame( 2, $tokens );
		$this->assertSame( 2, $patches );
	}

	public function test_a_second_401_is_reported(): void {
		$settings = $this->configured_settings();
		$api      = new GmailApi( new GmailTokenClient( $settings, $this->encryption() ), $settings );
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::token_ok(),
				'PATCH https://gmail.googleapis.com/'      => self::http_response( 401, [ 'error' => [ 'message' => 'Invalid Credentials' ] ] ),
			]
		);

		try {
			$api->update_signature( 'ana@acme.com', 'ana@acme.com', '<p>x</p>' );
			$this->fail( 'Expected GmailException' );
		} catch ( GmailException $e ) {
			$this->assertSame( GmailException::UNAUTHORIZED, $e->reason() );
		}
		$this->assertCount( 2, $this->requests_to( 'https://gmail.googleapis.com/' ) );
	}

	public function test_list_send_as_normalises_addresses(): void {
		$settings = $this->configured_settings();
		$api      = new GmailApi( new GmailTokenClient( $settings, $this->encryption() ), $settings );
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::token_ok(),
				'GET https://gmail.googleapis.com/'        => self::http_response(
					200,
					[
						'sendAs' => [
							[
								'sendAsEmail' => 'Ana@acme.com',
								'displayName' => 'Ana',
								'isPrimary'   => true,
								'isDefault'   => true,
							],
							[
								'sendAsEmail'        => 'sales@acme.com',
								'verificationStatus' => 'accepted',
							],
							[ 'broken' => true ],
						],
					]
				),
			]
		);

		$this->assertSame(
			[
				[
					'email'               => 'ana@acme.com',
					'display_name'        => 'Ana',
					'is_primary'          => true,
					'is_default'          => true,
					'verification_status' => '',
				],
				[
					'email'               => 'sales@acme.com',
					'display_name'        => '',
					'is_primary'          => false,
					'is_default'          => false,
					'verification_status' => 'accepted',
				],
			],
			$api->list_send_as( 'ana@acme.com' )
		);
		$this->assertSame( 'https://gmail.googleapis.com/gmail/v1/users/ana%40acme.com/settings/sendAs', $this->requests_to( 'https://gmail.googleapis.com/' )[0]['url'] );
	}
}
