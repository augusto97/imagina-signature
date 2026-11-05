<?php
/**
 * Service-account validation, storage and redaction.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment\Gmail;

use Brain\Monkey;
use ImaginaSignatures\Deployment\Gmail\GmailCredentials;
use ImaginaSignatures\Deployment\Gmail\GmailException;
use ImaginaSignatures\Deployment\Gmail\GmailSettings;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Security\Encryption;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/GmailTestHarness.php';

/**
 * @covers \ImaginaSignatures\Deployment\Gmail\GmailSettings
 * @covers \ImaginaSignatures\Deployment\Gmail\GmailCredentials
 */
final class GmailSettingsTest extends TestCase {

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

	public function test_valid_key_file_keeps_only_the_needed_fields(): void {
		$parsed = GmailSettings::parse_service_account( (string) json_encode( $this->service_account() ) );

		$this->assertSame(
			[ 'client_email', 'client_id', 'project_id', 'private_key_id', 'private_key', 'key_fingerprint' ],
			array_keys( $parsed )
		);
		$this->assertSame( 'pusher@acme-signatures.iam.gserviceaccount.com', $parsed['client_email'] );
		$this->assertSame( '112233445566778899001', $parsed['client_id'] );
		$this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $parsed['key_fingerprint'] );
		$this->assertNotFalse( openssl_pkey_get_private( $parsed['private_key'] ) );
	}

	public function test_decoded_object_is_accepted_too(): void {
		$parsed = GmailSettings::parse_service_account( $this->service_account() );
		$this->assertSame( 'acme-signatures', $parsed['project_id'] );
	}

	/**
	 * @return array<string, array{0: mixed, 1: string}>
	 */
	public function invalid_key_files(): array {
		$pair = self::key_pair();
		return [
			'not json'          => [ 'definitely not json', 'service_account' ],
			'oauth client file' => [ [ 'installed' => [ 'client_id' => 'x' ] ], 'type' ],
			'wrong type'        => [ [ 'type' => 'authorized_user' ], 'type' ],
			'bad pem'           => [ [ 'private_key' => "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n" ], 'private_key' ],
			'public key only'   => [ [ 'private_key' => $pair['public'] ], 'private_key' ],
			'missing key'       => [ [ 'private_key' => '' ], 'private_key' ],
			'user email'        => [ [ 'client_email' => 'someone@acme.com' ], 'client_email' ],
			'client id'         => [ [ 'client_id' => 'abc' ], 'client_id' ],
			'key id'            => [ [ 'private_key_id' => 'not hex!' ], 'private_key_id' ],
		];
	}

	/**
	 * @dataProvider invalid_key_files
	 *
	 * @param mixed  $input Override or raw input.
	 * @param string $path  Expected error path.
	 */
	public function test_invalid_key_files_are_refused_with_the_field( $input, string $path ): void {
		if ( is_array( $input ) && ! isset( $input['installed'] ) && ( $input['type'] ?? 'service_account' ) === 'service_account' ) {
			$input = $this->service_account( $input );
		}

		try {
			GmailSettings::parse_service_account( is_array( $input ) ? (string) json_encode( $input ) : $input );
			$this->fail( 'Expected ValidationException' );
		} catch ( ValidationException $e ) {
			$this->assertContains( $path, array_column( $e->get_errors(), 'path' ) );
		}
	}

	public function test_oversized_input_is_refused_before_decoding(): void {
		$json = (string) json_encode( $this->service_account( [ 'padding' => str_repeat( 'a', GmailSettings::MAX_JSON_BYTES ) ] ) );

		try {
			GmailSettings::parse_service_account( $json );
			$this->fail( 'Expected ValidationException' );
		} catch ( ValidationException $e ) {
			$this->assertStringContainsString( 'too large', $e->get_errors()[0]['message'] );
		}
	}

	public function test_private_key_is_stored_encrypted_and_never_returned(): void {
		$settings = $this->configured_settings(
			[
				'auto_push'  => true,
				'daily_sync' => true,
			]
		);
		$pem      = self::key_pair()['private'];
		$pem_body = trim( explode( "\n", $pem )[1] );

		$stored = $this->options[ GmailSettings::OPTION ];
		$this->assertStringNotContainsString( $pem_body, (string) json_encode( $stored ) );
		$this->assertStringNotContainsString( 'PRIVATE KEY', (string) json_encode( $stored ) );
		$this->assertArrayNotHasKey( 'token_uri', $stored );
		$this->assertSame( trim( $pem ), trim( $this->encryption()->decrypt( $stored['private_key'] ) ) );

		$view = $settings->public_view();
		$this->assertArrayNotHasKey( 'private_key', $view );
		$this->assertStringNotContainsString( $pem_body, (string) json_encode( $view ) );
		$this->assertStringNotContainsString( $stored['private_key'], (string) json_encode( $view ) );
		$this->assertTrue( $view['configured'] );
		$this->assertSame( '112233445566778899001', $view['client_id'] );
		$this->assertSame( GmailSettings::SCOPE, $view['scope'] );
		$this->assertSame( [ 'acme.com' ], $view['domains'] );
		$this->assertTrue( $view['auto_push'] );
		$this->assertTrue( $view['daily_sync'] );
		$this->assertFalse( $view['push_aliases'] );

		// Decrypted for the token client only, and redacted when dumped.
		$credentials = $settings->credentials();
		$this->assertSame( trim( $pem ), trim( $credentials->private_key ) );
		$this->assertStringNotContainsString( $pem_body, print_r( $credentials, true ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions
	}

	public function test_undecryptable_key_is_diagnosed(): void {
		$this->configured_settings();
		$other = new GmailSettings( new Encryption( 'a-completely-different-dedicated-key!!' ) );

		try {
			$other->credentials();
			$this->fail( 'Expected GmailException' );
		} catch ( GmailException $e ) {
			$this->assertSame( GmailException::CREDENTIALS_UNREADABLE, $e->reason() );
		}
	}

	public function test_forget_drops_credentials_but_keeps_domains_and_toggles(): void {
		$settings = $this->configured_settings( [ 'auto_push' => true ] );
		$settings->forget_credentials();

		$fresh = new GmailSettings( $this->encryption() );
		$this->assertFalse( $fresh->is_configured() );
		$this->assertSame( '', $this->options[ GmailSettings::OPTION ]['private_key'] );
		$this->assertSame( [ 'acme.com' ], $fresh->domains() );
		$this->assertTrue( $fresh->auto_push() );
	}

	public function test_domains_are_normalised(): void {
		$this->assertSame(
			[ 'acme.com', 'acme.co.uk', 'xn--bcher-kva.example' ],
			GmailSettings::sanitize_domains( " ACME.com, @acme.co.uk\nhttps://xn--bcher-kva.example/ acme.com" )
		);
		$this->assertSame( [ 'acme.com' ], GmailSettings::sanitize_domains( [ 'someone@acme.com', '', [ 'x' ] ] ) );
	}

	/**
	 * @return array<string, array{0: string}>
	 */
	public function invalid_domains(): array {
		return [
			'path'     => [ 'acme.com/evil' ],
			'no tld'   => [ 'localhost' ],
			'space'    => [ 'ac me.com' ],
			'gmail'    => [ 'gmail.com' ],
			'unicode'  => [ 'bücher.example' ],
			'too long' => [ str_repeat( 'a', 64 ) . '.com' ],
		];
	}

	/**
	 * @dataProvider invalid_domains
	 */
	public function test_invalid_domains_are_refused( string $domain ): void {
		$this->expectException( ValidationException::class );
		GmailSettings::sanitize_domains( [ 'acme.com', $domain ] );
	}

	public function test_domain_matching_is_exact_and_case_insensitive(): void {
		$settings = $this->configured_settings( [ 'domains' => [ 'acme.com' ] ] );

		$this->assertTrue( $settings->is_domain_allowed( 'Ana@ACME.com' ) );
		$this->assertFalse( $settings->is_domain_allowed( 'ana@sub.acme.com' ) );
		$this->assertFalse( $settings->is_domain_allowed( 'ana@acme.com.evil.io' ) );
		$this->assertFalse( $settings->is_domain_allowed( 'no-at-sign' ) );
	}

	public function test_credentials_dto_redacts_on_debug(): void {
		$dto = new GmailCredentials( 'a@b.iam.gserviceaccount.com', '1', 'p', 'k', 'SECRET-PEM' );
		$this->assertSame( '[redacted]', $dto->__debugInfo()['private_key'] );
	}
}
