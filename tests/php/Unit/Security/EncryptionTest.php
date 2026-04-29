<?php
/**
 * Encryption round-trip tests.
 *
 * @package ImaginaSignatures\Tests\Unit\Security
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Security;

use ImaginaSignatures\Security\Encryption;
use PHPUnit\Framework\TestCase;

final class EncryptionTest extends TestCase {

	public function test_round_trip_of_plain_string(): void {
		$enc = new Encryption();

		$plain = 'super secret access key';
		$cipher = $enc->encrypt( $plain );
		$this->assertNotSame( $plain, $cipher );
		$this->assertSame( $plain, $enc->decrypt( $cipher ) );
	}

	public function test_round_trip_of_array(): void {
		$enc = new Encryption();

		$data = [ 'access_key' => 'AKIA', 'secret_key' => 'wJal' ];
		$cipher = $enc->encrypt_array( $data );
		$this->assertSame( $data, $enc->decrypt_array( $cipher ) );
	}

	public function test_two_encryptions_produce_different_ciphertexts(): void {
		$enc = new Encryption();
		$this->assertNotSame( $enc->encrypt( 'x' ), $enc->encrypt( 'x' ) );
	}
}
