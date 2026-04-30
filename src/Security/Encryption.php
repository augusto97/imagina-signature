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
 * AES-256-CBC + HMAC-SHA256 encrypt-then-MAC, with HKDF-SHA256 key
 * derivation per RFC 5869.
 *
 * Used to wrap S3-compatible credentials before persisting them in
 * `imgsig_storage_config`. The cipher and authentication keys are
 * derived independently from `AUTH_KEY` (defined in `wp-config.php`)
 * via HKDF: a leak of one role's key would not weaken the other.
 *
 * Output blob (base64-encoded):
 * ```
 *   version (1) || IV (16) || ciphertext (n) || HMAC (32)
 * ```
 *
 * Versioning: the version byte lets a future migration introduce a
 * new cipher / KDF without losing the ability to decrypt legacy
 * values. Sprint 1 only emits version 1; older formats are not
 * supported because we haven't shipped any.
 *
 * Threat model: the master secret lives in `wp-config.php`. If an
 * attacker can read that file, encryption no longer adds value; the
 * goal here is purely to harden against database-only exfiltration
 * (SQL injection elsewhere, leaked DB dumps, log shipping mishap).
 *
 * Key rotation: {@see rotate()} re-encrypts a blob produced under one
 * master secret as a blob under a different master secret, without
 * persisting either secret. The tooling that drives this (CLI / cron
 * / REST endpoint) is deferred — the primitive is here so it can land
 * later without changing the on-disk format again.
 *
 * @since 1.0.0
 */
final class Encryption {

	/**
	 * Current blob format version.
	 *
	 * Version 1 = HKDF-SHA256 + AES-256-CBC + HMAC-SHA256.
	 */
	private const VERSION = 1;

	/**
	 * AES-256 in CBC mode.
	 */
	private const CIPHER = 'aes-256-cbc';

	/**
	 * Hash used by both HKDF and the integrity HMAC.
	 */
	private const HASH_ALGO = 'sha256';

	/**
	 * AES-CBC block size (bytes).
	 */
	private const IV_LENGTH = 16;

	/**
	 * SHA-256 digest length (bytes).
	 */
	private const HMAC_LENGTH = 32;

	/**
	 * Length of every derived key (bytes).
	 */
	private const KEY_LENGTH = 32;

	/**
	 * HKDF `info` parameter for the encryption key.
	 *
	 * Versioned so a future cipher rotation can re-key the encryption
	 * role without colliding with legacy material.
	 */
	private const KEY_INFO_ENC = 'imgsig:enc:v1';

	/**
	 * HKDF `info` parameter for the authentication key.
	 */
	private const KEY_INFO_MAC = 'imgsig:mac:v1';

	/**
	 * Encrypts plaintext under the active master secret.
	 *
	 * Empty input returns an empty string so callers can persist the
	 * empty configuration without special-casing.
	 *
	 * @since 1.0.0
	 *
	 * @param string $plaintext UTF-8 plaintext (typically a JSON document).
	 *
	 * @return string Base64-encoded versioned blob.
	 *
	 * @throws EncryptionException When OpenSSL fails or no secret is available.
	 */
	public function encrypt( string $plaintext ): string {
		if ( '' === $plaintext ) {
			return '';
		}
		return $this->encrypt_with_secret( $plaintext, $this->resolve_secret() );
	}

	/**
	 * Decrypts a blob produced by {@see encrypt()}.
	 *
	 * @since 1.0.0
	 *
	 * @param string $encoded Base64-encoded versioned blob.
	 *
	 * @return string Decrypted UTF-8 plaintext (empty if input was empty).
	 *
	 * @throws EncryptionException On any tamper-detection or cryptographic failure.
	 */
	public function decrypt( string $encoded ): string {
		if ( '' === $encoded ) {
			return '';
		}
		return $this->decrypt_with_secret( $encoded, $this->resolve_secret() );
	}

	/**
	 * Re-encrypts a blob originally produced under `$old_secret`
	 * as a blob under `$new_secret`.
	 *
	 * Useful for `AUTH_KEY` rotation: the operator runs a tool that
	 * iterates every stored option, calls `rotate($old, $new, $blob)`,
	 * and persists the new blob — all without the secrets ever
	 * touching the database. Designed to be the primitive a future
	 * CLI / scheduled task drives; the orchestrator itself is out of
	 * scope for v1.0.
	 *
	 * @since 1.0.0
	 *
	 * @param string $encoded    Existing encrypted blob.
	 * @param string $old_secret Secret the blob was originally encrypted with.
	 * @param string $new_secret Secret to re-encrypt under.
	 *
	 * @return string Newly encrypted blob.
	 *
	 * @throws EncryptionException When the old blob fails to decrypt or the new encrypt fails.
	 */
	public function rotate( string $encoded, string $old_secret, string $new_secret ): string {
		if ( '' === $encoded ) {
			return '';
		}
		if ( '' === $old_secret || '' === $new_secret ) {
			throw new EncryptionException( 'Both old and new secrets are required for rotation.' );
		}
		$plaintext = $this->decrypt_with_secret( $encoded, $old_secret );
		return $this->encrypt_with_secret( $plaintext, $new_secret );
	}

	/**
	 * Underlying encrypt operation parameterised by secret.
	 *
	 * @since 1.0.0
	 *
	 * @param string $plaintext Plaintext to encrypt.
	 * @param string $secret    Master secret to derive keys from.
	 *
	 * @return string Base64-encoded versioned blob.
	 *
	 * @throws EncryptionException On OpenSSL failure.
	 */
	private function encrypt_with_secret( string $plaintext, string $secret ): string {
		$keys = $this->derive_keys( $secret );
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

		$body = chr( self::VERSION ) . $iv . $ciphertext;
		$hmac = hash_hmac( self::HASH_ALGO, $body, $keys['mac'], true );

		return base64_encode( $body . $hmac );
	}

	/**
	 * Underlying decrypt operation parameterised by secret.
	 *
	 * @since 1.0.0
	 *
	 * @param string $encoded Base64-encoded blob.
	 * @param string $secret  Master secret to derive keys from.
	 *
	 * @return string Plaintext.
	 *
	 * @throws EncryptionException On any malformed input or crypto failure.
	 */
	private function decrypt_with_secret( string $encoded, string $secret ): string {
		$blob = base64_decode( $encoded, true );
		if ( false === $blob ) {
			throw new EncryptionException( 'Invalid base64 payload' );
		}

		$min_size = 1 + self::IV_LENGTH + self::HMAC_LENGTH + 1;
		if ( strlen( $blob ) < $min_size ) {
			throw new EncryptionException( 'Ciphertext is shorter than the minimum frame size' );
		}

		$version = ord( $blob[0] );
		if ( self::VERSION !== $version ) {
			throw new EncryptionException(
				sprintf( 'Unsupported ciphertext version %d (expected %d).', $version, self::VERSION )
			);
		}

		$iv         = substr( $blob, 1, self::IV_LENGTH );
		$hmac       = substr( $blob, -self::HMAC_LENGTH );
		$body       = substr( $blob, 0, -self::HMAC_LENGTH );
		$ciphertext = substr( $blob, 1 + self::IV_LENGTH, -self::HMAC_LENGTH );

		$keys     = $this->derive_keys( $secret );
		$expected = hash_hmac( self::HASH_ALGO, $body, $keys['mac'], true );

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
	 * Derives the encryption + authentication keys from `$secret`.
	 *
	 * Uses `hash_hkdf` (PHP 7.1.2+, RFC 5869). The salt is a
	 * non-secret per-install value so two installs that somehow share
	 * the same `AUTH_KEY` (e.g. a bad backup restore) still produce
	 * distinct keys.
	 *
	 * @since 1.0.0
	 *
	 * @param string $secret Master secret.
	 *
	 * @return array{enc: string, mac: string} Two independent 32-byte keys.
	 *
	 * @throws EncryptionException When the OpenSSL extension is missing.
	 */
	private function derive_keys( string $secret ): array {
		if ( ! function_exists( 'hash_hkdf' ) ) {
			throw new EncryptionException( 'hash_hkdf() is unavailable; PHP 7.1.2 or newer is required.' );
		}

		$salt = $this->derive_salt();

		return [
			'enc' => hash_hkdf( self::HASH_ALGO, $secret, self::KEY_LENGTH, self::KEY_INFO_ENC, $salt ),
			'mac' => hash_hkdf( self::HASH_ALGO, $secret, self::KEY_LENGTH, self::KEY_INFO_MAC, $salt ),
		];
	}

	/**
	 * Returns a per-install salt for HKDF.
	 *
	 * Falls back to an empty salt when WP isn't loaded — HKDF is
	 * still secure with a zero-length salt for high-entropy IKM, just
	 * less defensive against the (rare) shared-`AUTH_KEY` scenario.
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	private function derive_salt(): string {
		if ( function_exists( 'wp_salt' ) ) {
			$salt = wp_salt( 'nonce' );
			if ( is_string( $salt ) && '' !== $salt ) {
				return $salt;
			}
		}
		return '';
	}

	/**
	 * Returns the master secret used for key derivation.
	 *
	 * Prefers `AUTH_KEY`; falls back to `wp_salt('auth')` so the service
	 * still functions on installs that fail to set `AUTH_KEY`.
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
