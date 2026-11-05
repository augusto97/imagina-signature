<?php
/**
 * RS256 JWT assertion for the service-account token exchange.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

defined( 'ABSPATH' ) || exit;

/**
 * Builds the signed JWT a service account trades for an access token
 * impersonating a Workspace user (OAuth 2.0 JWT bearer grant, RFC 7523,
 * as Google documents for domain-wide delegation).
 *
 * Written by hand — `openssl_sign()` with SHA-256 over
 * `base64url(header) . '.' . base64url(claims)` — so no Composer
 * dependency (JWT library / Google SDK) ships with the plugin.
 *
 * Claims: `iss` = service-account email, `scope`, `aud` = Google's token
 * endpoint, `sub` = the impersonated user, `iat` / `exp` (one hour,
 * Google's maximum).
 *
 * @since 1.3.0
 */
final class JwtAssertion {

	/** Token endpoint, also the JWT audience. */
	public const AUDIENCE = 'https://oauth2.googleapis.com/token';

	/** Assertion lifetime in seconds (Google rejects more than an hour). */
	public const LIFETIME = 3600;

	/**
	 * Builds and signs the assertion.
	 *
	 * @since 1.3.0
	 *
	 * @param GmailCredentials $credentials Service account.
	 * @param string           $subject     Workspace user to impersonate.
	 * @param string           $scope       Space-separated scopes.
	 * @param int              $now         Unix time used as `iat`.
	 *
	 * @return string `header.claims.signature`, base64url segments.
	 *
	 * @throws GmailException When the key can't be loaded or signing fails.
	 */
	public static function build( GmailCredentials $credentials, string $subject, string $scope, int $now ): string {
		$header = [
			'alg' => 'RS256',
			'typ' => 'JWT',
		];
		if ( '' !== $credentials->private_key_id ) {
			$header['kid'] = $credentials->private_key_id;
		}

		$claims = [
			'iss'   => $credentials->client_email,
			'scope' => $scope,
			'aud'   => self::AUDIENCE,
			'sub'   => $subject,
			'iat'   => $now,
			'exp'   => $now + self::LIFETIME,
		];

		$signing_input = self::base64url_encode( (string) wp_json_encode( $header, JSON_UNESCAPED_SLASHES ) )
			. '.'
			. self::base64url_encode( (string) wp_json_encode( $claims, JSON_UNESCAPED_SLASHES ) );

		$key       = openssl_pkey_get_private( $credentials->private_key );
		$signature = '';
		if ( false === $key || ! openssl_sign( $signing_input, $signature, $key, OPENSSL_ALGO_SHA256 ) ) {
			throw new GmailException(
				GmailException::CREDENTIALS_UNREADABLE,
				__( 'The service-account private key could not be used to sign the request. Upload the JSON key again.', 'imagina-signatures' )
			);
		}

		return $signing_input . '.' . self::base64url_encode( $signature );
	}

	/**
	 * URL-safe base64 without padding (RFC 7515 §2).
	 *
	 * @since 1.3.0
	 *
	 * @param string $data Raw bytes.
	 *
	 * @return string
	 */
	public static function base64url_encode( string $data ): string {
		return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- JWT encoding.
	}

	/**
	 * Inverse of {@see base64url_encode()} ('' on malformed input).
	 *
	 * @since 1.3.0
	 *
	 * @param string $data base64url text.
	 *
	 * @return string
	 */
	public static function base64url_decode( string $data ): string {
		$padded  = strtr( $data, '-_', '+/' );
		$padded .= str_repeat( '=', ( 4 - strlen( $padded ) % 4 ) % 4 );
		$decoded = base64_decode( $padded, true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- JWT decoding.
		return false === $decoded ? '' : $decoded;
	}
}
