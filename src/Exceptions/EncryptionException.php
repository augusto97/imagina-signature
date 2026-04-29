<?php
/**
 * Encryption / decryption error.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

defined( 'ABSPATH' ) || exit;

/**
 * Thrown by the {@see \ImaginaSignatures\Security\Encryption} service when
 * encryption or decryption fails.
 *
 * Common causes: missing OpenSSL extension, missing or rotated `AUTH_KEY`,
 * tampered ciphertext (HMAC mismatch), or malformed base64 input. The
 * storage layer typically translates these into a generic "credentials
 * could not be read" message in the admin UI without surfacing the
 * cryptographic detail.
 *
 * @since 1.0.0
 */
class EncryptionException extends ImaginaSignaturesException {
}
