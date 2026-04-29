<?php
/**
 * AES-256-CBC encryption helper for plugin secrets.
 *
 * @package ImaginaSignatures\Security
 */

declare(strict_types=1);

namespace ImaginaSignatures\Security;

use ImaginaSignatures\Exceptions\ImaginaSignaturesException;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Encrypts and decrypts at-rest secrets (e.g. S3 credentials).
 *
 * The encryption key is derived from `AUTH_KEY` plus a plugin-specific salt,
 * so secrets are scoped to the host site and cannot be replayed elsewhere.
 *
 * Falls back to a randomly-persisted key in the `imgsig_encryption_key`
 * option if `AUTH_KEY` is unavailable (for example, on hosts that haven't
 * regenerated their salts). The fallback is documented as less secure but
 * keeps the plugin operational.
 *
 * @since 1.0.0
 */
final class Encryption {

	private const CIPHER     = 'AES-256-CBC';
	private const KEY_LENGTH = 32;
	private const IV_LENGTH  = 16;

	/**
	 * Cached encryption key (raw bytes).
	 *
	 * @var string
	 */
	private string $key;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->key = $this->derive_key();
	}

	/**
	 * Encrypts a string and returns base64-encoded `iv|ciphertext`.
	 *
	 * @since 1.0.0
	 *
	 * @param string $plaintext Plain text to encrypt.
	 *
	 * @return string Base64-encoded ciphertext.
	 *
	 * @throws ImaginaSignaturesException When OpenSSL is unavailable or fails.
	 */
	public function encrypt( string $plaintext ): string {
		if ( ! function_exists( 'openssl_encrypt' ) ) {
			throw new ImaginaSignaturesException( 'OpenSSL extension is required for encryption.' );
		}

		$iv         = random_bytes( self::IV_LENGTH );
		$ciphertext = openssl_encrypt( $plaintext, self::CIPHER, $this->key, OPENSSL_RAW_DATA, $iv );
		if ( false === $ciphertext ) {
			throw new ImaginaSignaturesException( 'Encryption failed.' );
		}

		return base64_encode( $iv . $ciphertext );
	}

	/**
	 * Decrypts a value produced by `encrypt()`.
	 *
	 * @since 1.0.0
	 *
	 * @param string $encoded Base64-encoded `iv|ciphertext`.
	 *
	 * @return string Decrypted plaintext.
	 *
	 * @throws ImaginaSignaturesException When the input is malformed or decryption fails.
	 */
	public function decrypt( string $encoded ): string {
		if ( ! function_exists( 'openssl_decrypt' ) ) {
			throw new ImaginaSignaturesException( 'OpenSSL extension is required for decryption.' );
		}

		$decoded = base64_decode( $encoded, true );
		if ( false === $decoded || strlen( $decoded ) <= self::IV_LENGTH ) {
			throw new ImaginaSignaturesException( 'Encrypted payload is malformed.' );
		}

		$iv         = substr( $decoded, 0, self::IV_LENGTH );
		$ciphertext = substr( $decoded, self::IV_LENGTH );
		$plaintext  = openssl_decrypt( $ciphertext, self::CIPHER, $this->key, OPENSSL_RAW_DATA, $iv );
		if ( false === $plaintext ) {
			throw new ImaginaSignaturesException( 'Decryption failed.' );
		}

		return $plaintext;
	}

	/**
	 * Convenience for round-tripping JSON-serializable arrays.
	 *
	 * @param array<string, mixed> $data Data to encrypt.
	 *
	 * @return string Encoded ciphertext.
	 */
	public function encrypt_array( array $data ): string {
		return $this->encrypt( (string) wp_json_encode( $data ) );
	}

	/**
	 * Decrypts a payload back into an array.
	 *
	 * @param string $encoded Base64 ciphertext.
	 *
	 * @return array<string, mixed>
	 *
	 * @throws ImaginaSignaturesException If decoding fails.
	 */
	public function decrypt_array( string $encoded ): array {
		$json = $this->decrypt( $encoded );
		$data = json_decode( $json, true );
		if ( ! is_array( $data ) ) {
			throw new ImaginaSignaturesException( 'Decrypted value is not a JSON array.' );
		}
		return $data;
	}

	/**
	 * Derives the encryption key.
	 *
	 * @return string Raw 32-byte key.
	 */
	private function derive_key(): string {
		if ( defined( 'AUTH_KEY' ) && '' !== AUTH_KEY ) {
			return hash( 'sha256', AUTH_KEY . '|imgsig|v1', true );
		}

		$persisted = get_option( 'imgsig_encryption_key', '' );
		if ( ! is_string( $persisted ) || '' === $persisted ) {
			$random    = base64_encode( random_bytes( self::KEY_LENGTH ) );
			$persisted = $random;
			update_option( 'imgsig_encryption_key', $persisted, false );
		}

		return hash( 'sha256', $persisted . '|imgsig|v1', true );
	}
}
