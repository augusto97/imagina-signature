<?php
/**
 * Unit tests for the Encryption service.
 *
 * @package ImaginaSignatures\Tests\Unit\Security
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Security;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Exceptions\EncryptionException;
use ImaginaSignatures\Security\Encryption;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Security\Encryption
 */
final class EncryptionTest extends TestCase {

	private const SECRET_A = 'A2vAR9!q@ZWvJTgJjB#X8mDpYRf+Lq3w%cZdN-LkE7s5tF*kWy';
	private const SECRET_B = 'B7K^mJ#vRT&YpL!4aXqN8WzC@e+sQ-FdU3Hg6Ev_M2kP*nDwR';

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		// Stable salt source for deterministic test runs.
		Functions\when( 'wp_salt' )->justReturn( 'fixed-test-salt' );

		// Define AUTH_KEY for the resolve_secret() path.
		if ( ! defined( 'AUTH_KEY' ) ) {
			define( 'AUTH_KEY', self::SECRET_A );
		}
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_encrypt_decrypt_round_trips_text(): void {
		$crypto    = new Encryption();
		$plaintext = 'hello world';

		$blob = $crypto->encrypt( $plaintext );
		$this->assertNotSame( $plaintext, $blob );
		$this->assertNotEmpty( $blob );

		$this->assertSame( $plaintext, $crypto->decrypt( $blob ) );
	}

	public function test_encrypt_decrypt_round_trips_json(): void {
		$crypto = new Encryption();
		$json   = '{"access_key":"AKIA","secret_key":"verySecret/+="}';

		$blob = $crypto->encrypt( $json );
		$this->assertSame( $json, $crypto->decrypt( $blob ) );
	}

	public function test_encrypt_returns_empty_for_empty_input(): void {
		$this->assertSame( '', ( new Encryption() )->encrypt( '' ) );
	}

	public function test_decrypt_returns_empty_for_empty_input(): void {
		$this->assertSame( '', ( new Encryption() )->decrypt( '' ) );
	}

	public function test_each_encrypt_call_uses_a_fresh_iv(): void {
		$crypto = new Encryption();
		$first  = $crypto->encrypt( 'identical input' );
		$second = $crypto->encrypt( 'identical input' );

		$this->assertNotSame( $first, $second, 'Random IV must produce distinct ciphertexts.' );
	}

	public function test_decrypt_rejects_tampered_ciphertext(): void {
		$crypto = new Encryption();
		$blob   = $crypto->encrypt( 'sensitive data' );

		// Flip the last byte of the base64-decoded blob (inside the HMAC region).
		$raw    = base64_decode( $blob, true );
		$raw[ strlen( $raw ) - 1 ] = chr( ord( $raw[ strlen( $raw ) - 1 ] ) ^ 0xff );
		$tampered = base64_encode( $raw );

		$this->expectException( EncryptionException::class );
		$crypto->decrypt( $tampered );
	}

	public function test_decrypt_rejects_garbage_input(): void {
		$crypto = new Encryption();

		$this->expectException( EncryptionException::class );
		$crypto->decrypt( 'this is not valid base64 / nor a blob' );
	}

	public function test_decrypt_rejects_short_blob(): void {
		$crypto = new Encryption();

		$this->expectException( EncryptionException::class );
		$crypto->decrypt( base64_encode( 'too-short' ) );
	}

	public function test_blob_starts_with_version_byte(): void {
		$crypto = new Encryption();
		$blob   = $crypto->encrypt( 'payload' );
		$raw    = base64_decode( $blob, true );

		$this->assertNotFalse( $raw );
		$this->assertSame( 1, ord( $raw[0] ), 'First byte should be the format version.' );
	}

	public function test_rotate_re_encrypts_under_a_new_secret(): void {
		$crypto = new Encryption();
		$blob   = $crypto->encrypt( 'rotate-me' );

		$rotated = $crypto->rotate( $blob, self::SECRET_A, self::SECRET_B );

		// Rotated blob is different and decryptable under the new secret only.
		$this->assertNotSame( $blob, $rotated );

		// Brain Monkey doesn't let us swap AUTH_KEY mid-test, so verify
		// rotate() round-trips through its own internal call path:
		$round_trip = $crypto->rotate( $rotated, self::SECRET_B, self::SECRET_A );
		$this->assertSame( 'rotate-me', $crypto->decrypt( $round_trip ) );
	}

	public function test_rotate_rejects_empty_secrets(): void {
		$crypto = new Encryption();

		$this->expectException( EncryptionException::class );
		$crypto->rotate( $crypto->encrypt( 'x' ), '', self::SECRET_B );
	}

	public function test_rotate_returns_empty_for_empty_blob(): void {
		$this->assertSame(
			'',
			( new Encryption() )->rotate( '', self::SECRET_A, self::SECRET_B )
		);
	}
}
