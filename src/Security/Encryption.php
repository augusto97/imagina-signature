<?php
/**
 * Symmetric encryption for sensitive plugin data.
 *
 * @package ImaginaSignatures\Security
 */

declare(strict_types=1);

namespace ImaginaSignatures\Security;

use ImaginaSignatures\Exceptions\EncryptionException;

defined( 'ABSPATH' ) || exit;

/**
 * AES-256-CBC + HMAC-SHA256 encrypt-then-MAC.
 *
 * Used to wrap S3-compatible credentials before persisting them in
 * `imgsig_storage_config`. The cipher and authentication keys are derived
 * from `AUTH_KEY` (defined in `wp-config.php`) via HKDF-style key
 * separation: each role gets its own 32-byte key, so a leak of one would
 * not weaken the other.
 *
 * Output format (base64-encoded):
 * ```
 *   IV (16 bytes) || ciphertext (n bytes) || HMAC (32 bytes)
 * ```
 *
 * Versioning: the `KEY_INFO_*` constants embed an algorithm version so a
 * future migration can rotate ciphers without losing the ability to
 * decrypt legacy values.
 *
 * Threat model: the secret lives in `wp-config.php`. If an attacker can
 * read `wp-config.php`, encryption no longer adds value; the goal here
 * is purely to harden against database-only exfiltration (SQL injection
 * elsewhere, leaked DB dumps, etc.).
 *
 * @since 1.0.0
 */
final class Encryption {

	/**
	 * Cipher identifier. AES-256 in CBC mode.
	 */
	private const CIPHER = 'aes-256-cbc';

	/**
	 * HMAC algorithm.
	 */
	private const HMAC_ALGO = 'sha256';

	/**
	 * Block size for AES-CBC IV (bytes).
	 */
	private const IV_LENGTH = 16;

	/**
	 * SHA-256 output length (bytes).
	 */
	private const HMAC_LENGTH = 32;

	/**
	 * Domain-separation label for the encryption key derivation.
	 *
	 * Versioned so an algorithm rotation can re-key without colliding
	 * with the legacy key.
	 */
	private const KEY_INFO_ENC = 'imgsig:enc:v1';

	/**
	 * Domain-separation label for the authentication key derivation.
	 */
	private const KEY_INFO_MAC = 'imgsig:mac:v1';

	/**
	 * Encrypts a plaintext string and returns a base64-encoded blob.
	 *
	 * Empty input returns an empty string (so callers can persist the
	 * empty configuration without special-casing).
	 *
	 * @since 1.0.0
	 *
	 * @param string $plaintext Plain UTF-8 string (often a JSON document).
	 *
	 * @return string Base64-encoded `IV || ciphertext || HMAC`.
	 *
	 * @throws EncryptionException When the OpenSSL primitives fail or no
	 *                             secret is available.
	 */
	public function encrypt( string $plaintext ): string {
		if ( '' === $plaintext ) {
			return '';
		}

		$keys = $this->derive_keys();
		$iv   = random_bytes( self::IV_LENGTH );

		$ciphertext = openssl_encrypt(
			$plaintext,
			self::CIPHER,
			$keys['enc'],
			OPENSSL_RAW_DATA,
			$iv
		);

		if ( false === $ciphertext ) {
			throw new EncryptionException( 'openssl_encrypt failed' );
		}

		$payload = $iv . $ciphertext;
		$hmac    = hash_hmac( self::HMAC_ALGO, $payload, $keys['mac'], true );

		return base64_encode( $payload . $hmac );
	}

	/**
	 * Decrypts a previously-encrypted blob.
	 *
	 * Empty input returns an empty string. Verifies the HMAC in
	 * constant time before attempting decryption.
	 *
	 * @since 1.0.0
	 *
	 * @param string $encoded Base64-encoded `IV || ciphertext || HMAC`.
	 *
	 * @return string The decrypted plaintext.
	 *
	 * @throws EncryptionException On any tamper-detection or cryptographic failure.
	 */
	public function decrypt( string $encoded ): string {
		if ( '' === $encoded ) {
			return '';
		}

		$blob = base64_decode( $encoded, true );
		if ( false === $blob ) {
			throw new EncryptionException( 'Invalid base64 payload' );
		}

		$min_size = self::IV_LENGTH + self::HMAC_LENGTH + 1;
		if ( strlen( $blob ) < $min_size ) {
			throw new EncryptionException( 'Ciphertext is shorter than the minimum frame size' );
		}

		$iv         = substr( $blob, 0, self::IV_LENGTH );
		$hmac       = substr( $blob, -self::HMAC_LENGTH );
		$ciphertext = substr( $blob, self::IV_LENGTH, -self::HMAC_LENGTH );

		$keys     = $this->derive_keys();
		$expected = hash_hmac( self::HMAC_ALGO, $iv . $ciphertext, $keys['mac'], true );

		if ( ! hash_equals( $expected, $hmac ) ) {
			throw new EncryptionException( 'HMAC verification failed (tampered ciphertext or wrong key)' );
		}

		$plaintext = openssl_decrypt(
			$ciphertext,
			self::CIPHER,
			$keys['enc'],
			OPENSSL_RAW_DATA,
			$iv
		);

		if ( false === $plaintext ) {
			throw new EncryptionException( 'openssl_decrypt failed' );
		}

		return $plaintext;
	}

	/**
	 * Derives the encryption and authentication keys from the WP secret.
	 *
	 * @since 1.0.0
	 *
	 * @return array{enc: string, mac: string}
	 *
	 * @throws EncryptionException When no secret is available.
	 */
	private function derive_keys(): array {
		$secret = $this->resolve_secret();
		return [
			'enc' => hash_hmac( self::HMAC_ALGO, self::KEY_INFO_ENC, $secret, true ),
			'mac' => hash_hmac( self::HMAC_ALGO, self::KEY_INFO_MAC, $secret, true ),
		];
	}

	/**
	 * Returns the master secret used for key derivation.
	 *
	 * Prefers `AUTH_KEY` (set in `wp-config.php`); falls back to
	 * `wp_salt('auth')` so the service still functions on installs that
	 * fail to set `AUTH_KEY`.
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 *
	 * @throws EncryptionException When no usable secret can be found.
	 */
	private function resolve_secret(): string {
		if ( defined( 'AUTH_KEY' ) && is_string( AUTH_KEY ) && '' !== AUTH_KEY ) {
			return AUTH_KEY;
		}

		if ( function_exists( 'wp_salt' ) ) {
			$salt = wp_salt( 'auth' );
			if ( is_string( $salt ) && '' !== $salt ) {
				return $salt;
			}
		}

		throw new EncryptionException( 'No encryption secret is available (define AUTH_KEY in wp-config.php)' );
	}
}
