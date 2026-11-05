<?php
/**
 * JWT assertion + token exchange / caching.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment\Gmail;

use Brain\Monkey;
use ImaginaSignatures\Deployment\Gmail\GmailCredentials;
use ImaginaSignatures\Deployment\Gmail\GmailException;
use ImaginaSignatures\Deployment\Gmail\GmailSettings;
use ImaginaSignatures\Deployment\Gmail\GmailTokenClient;
use ImaginaSignatures\Deployment\Gmail\JwtAssertion;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/GmailTestHarness.php';

/**
 * @covers \ImaginaSignatures\Deployment\Gmail\JwtAssertion
 * @covers \ImaginaSignatures\Deployment\Gmail\GmailTokenClient
 */
final class GmailTokenClientTest extends TestCase {

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

	private function credentials(): GmailCredentials {
		return new GmailCredentials(
			'pusher@acme-signatures.iam.gserviceaccount.com',
			'112233445566778899001',
			'acme-signatures',
			'0123456789abcdef0123456789abcdef01234567',
			self::key_pair()['private']
		);
	}

	/**
	 * @return array{0: array<string, mixed>, 1: array<string, mixed>, 2: string, 3: string}
	 */
	private function split( string $jwt ): array {
		$parts = explode( '.', $jwt );
		$this->assertCount( 3, $parts );
		foreach ( $parts as $part ) {
			$this->assertMatchesRegularExpression( '/^[A-Za-z0-9_-]+$/', $part, 'base64url without padding' );
		}
		return [
			json_decode( JwtAssertion::base64url_decode( $parts[0] ), true ),
			json_decode( JwtAssertion::base64url_decode( $parts[1] ), true ),
			$parts[0] . '.' . $parts[1],
			JwtAssertion::base64url_decode( $parts[2] ),
		];
	}

	public function test_jwt_has_google_claims_and_a_valid_rs256_signature(): void {
		$jwt = JwtAssertion::build( $this->credentials(), 'ana@acme.com', GmailSettings::SCOPE, 1700000000 );

		[ $header, $claims, $signing_input, $signature ] = $this->split( $jwt );

		$this->assertSame(
			[
				'alg' => 'RS256',
				'typ' => 'JWT',
				'kid' => '0123456789abcdef0123456789abcdef01234567',
			],
			$header
		);
		$this->assertSame(
			[
				'iss'   => 'pusher@acme-signatures.iam.gserviceaccount.com',
				'scope' => 'https://www.googleapis.com/auth/gmail.settings.basic',
				'aud'   => 'https://oauth2.googleapis.com/token',
				'sub'   => 'ana@acme.com',
				'iat'   => 1700000000,
				'exp'   => 1700003600,
			],
			$claims
		);

		$public = openssl_pkey_get_public( self::key_pair()['public'] );
		$this->assertSame( 1, openssl_verify( $signing_input, $signature, $public, OPENSSL_ALGO_SHA256 ) );
		$this->assertSame( 0, openssl_verify( $signing_input . 'x', $signature, $public, OPENSSL_ALGO_SHA256 ) );
	}

	public function test_base64url_round_trips_binary(): void {
		$bytes = "\xfb\xff\xfe\x00?>";
		$this->assertSame( '-__-AD8-', JwtAssertion::base64url_encode( $bytes ) );
		$this->assertSame( $bytes, JwtAssertion::base64url_decode( '-__-AD8-' ) );
	}

	public function test_unusable_key_is_diagnosed(): void {
		$credentials              = $this->credentials();
		$credentials->private_key = "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----\n";

		try {
			JwtAssertion::build( $credentials, 'ana@acme.com', GmailSettings::SCOPE, time() );
			$this->fail( 'Expected GmailException' );
		} catch ( GmailException $e ) {
			$this->assertSame( GmailException::CREDENTIALS_UNREADABLE, $e->reason() );
		}
	}

	public function test_token_exchange_posts_a_jwt_bearer_grant_to_the_fixed_endpoint(): void {
		$client = new GmailTokenClient( $this->configured_settings(), $this->encryption() );
		$this->route_http( [ 'POST https://oauth2.googleapis.com/token' => self::token_ok( 'ya29.first' ) ] );

		$this->assertSame( 'ya29.first', $client->access_token( 'ana@acme.com' ) );

		$this->assertCount( 1, $this->http_requests );
		$request = $this->http_requests[0];
		// Never the token_uri of the uploaded JSON (evil.example).
		$this->assertSame( 'https://oauth2.googleapis.com/token', $request['url'] );
		$this->assertSame( 0, $request['args']['redirection'] );
		$this->assertLessThanOrEqual( 10, $request['args']['timeout'] );
		$this->assertSame( 'urn:ietf:params:oauth:grant-type:jwt-bearer', $request['args']['body']['grant_type'] );

		[ , $claims ] = $this->split( $request['args']['body']['assertion'] );
		$this->assertSame( 'ana@acme.com', $claims['sub'] );
		$this->assertSame( GmailSettings::SCOPE, $claims['scope'] );
		$this->assertEqualsWithDelta( time(), $claims['iat'], 5 );
		$this->assertSame( 3600, $claims['exp'] - $claims['iat'] );
	}

	public function test_tokens_are_cached_per_user_encrypted_for_at_most_50_minutes(): void {
		$client = new GmailTokenClient( $this->configured_settings(), $this->encryption() );
		$issued = 0;
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => static function () use ( &$issued ): array {
					++$issued;
					return self::http_response(
						200,
						[
							'access_token' => 'ya29.token-' . $issued,
							'expires_in'   => 3599,
						]
					);
				},
			]
		);

		$this->assertSame( 'ya29.token-1', $client->access_token( 'ana@acme.com' ) );
		$this->assertSame( 'ya29.token-1', $client->access_token( 'ANA@acme.com' ), 'cached, case-insensitive' );
		$this->assertSame( 'ya29.token-2', $client->access_token( 'bob@acme.com' ), 'one token per user' );
		$this->assertSame( 2, $issued );

		$this->assertCount( 2, $this->transients );
		foreach ( $this->transients as $name => $entry ) {
			$this->assertStringStartsWith( 'imgsig_gmail_tok_', $name );
			$this->assertLessThanOrEqual( 50 * 60, $entry['ttl'] );
			$this->assertGreaterThan( 0, $entry['ttl'] );
			$this->assertStringNotContainsString( 'ya29', (string) $entry['value'], 'stored encrypted' );
		}

		// Fresh bypasses the cache; forget() drops it.
		$this->assertSame( 'ya29.token-3', $client->access_token( 'ana@acme.com', true ) );
		$client->forget( 'ana@acme.com' );
		$this->assertSame( 'ya29.token-4', $client->access_token( 'ana@acme.com' ) );
	}

	public function test_short_lived_tokens_are_cached_shorter(): void {
		$client = new GmailTokenClient( $this->configured_settings(), $this->encryption() );
		$this->route_http(
			[
				'POST https://oauth2.googleapis.com/token' => self::http_response(
					200,
					[
						'access_token' => 'ya29.short',
						'expires_in'   => 900,
					]
				),
			]
		);

		$client->access_token( 'ana@acme.com' );
		$entry = array_values( $this->transients )[0];
		$this->assertSame( 600, $entry['ttl'] );
	}

	public function test_google_token_errors_are_surfaced_and_not_cached(): void {
		$client = new GmailTokenClient( $this->configured_settings(), $this->encryption() );
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

		try {
			$client->access_token( 'ana@acme.com' );
			$this->fail( 'Expected GmailException' );
		} catch ( GmailException $e ) {
			$this->assertSame( GmailException::DELEGATION_MISSING, $e->reason() );
			$this->assertStringContainsString( '112233445566778899001', $e->getMessage() );
			$this->assertStringContainsString( GmailSettings::SCOPE, $e->getMessage() );
			$this->assertStringContainsString( 'unauthorized_client: Client is unauthorized', $e->google_message() );
			$this->assertFalse( $e->is_retryable() );
		}
		$this->assertSame( [], $this->transients );
	}

	public function test_transport_failure_is_retryable(): void {
		$client             = new GmailTokenClient( $this->configured_settings(), $this->encryption() );
		$this->http_handler = static function () {
			return new \WP_Error( 'http_request_failed', 'cURL error 28: Operation timed out' );
		};

		try {
			$client->access_token( 'ana@acme.com' );
			$this->fail( 'Expected GmailException' );
		} catch ( GmailException $e ) {
			$this->assertSame( GmailException::NETWORK, $e->reason() );
			$this->assertTrue( $e->is_retryable() );
			$this->assertStringContainsString( 'timed out', $e->getMessage() );
		}
	}

	public function test_missing_access_token_is_an_invalid_response(): void {
		$client = new GmailTokenClient( $this->configured_settings(), $this->encryption() );
		$this->route_http( [ 'POST https://oauth2.googleapis.com/token' => self::http_response( 200, [ 'token_type' => 'Bearer' ] ) ] );

		$this->expectException( GmailException::class );
		$client->access_token( 'ana@acme.com' );
	}

	public function test_not_configured_never_calls_google(): void {
		$client = new GmailTokenClient( new GmailSettings( $this->encryption() ), $this->encryption() );

		try {
			$client->access_token( 'ana@acme.com' );
			$this->fail( 'Expected GmailException' );
		} catch ( GmailException $e ) {
			$this->assertSame( GmailException::NOT_CONFIGURED, $e->reason() );
		}
		$this->assertSame( [], $this->http_requests );
	}
}
