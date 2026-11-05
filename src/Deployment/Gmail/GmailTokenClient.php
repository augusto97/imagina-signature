<?php
/**
 * Access tokens for impersonated Workspace users.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

use ImaginaSignatures\Exceptions\EncryptionException;
use ImaginaSignatures\Security\Encryption;

defined( 'ABSPATH' ) || exit;

/**
 * Exchanges a signed {@see JwtAssertion} for an OAuth access token that
 * acts as one Workspace user (domain-wide delegation), and caches it.
 *
 *  - POST to the fixed Google endpoint through `wp_safe_remote_post()`
 *    (no redirects, short timeout) — never to the `token_uri` of the
 *    uploaded JSON.
 *  - Cached per (service account, key, user) in a transient for at most
 *    50 minutes (tokens live 60). The token is stored encrypted so a
 *    database dump doesn't hand out live Gmail access.
 *  - Google's error body is surfaced through {@see GmailErrorMapper}.
 *
 * Not `final` so PHPUnit can double it.
 *
 * @since 1.3.0
 */
class GmailTokenClient {

	/** Google OAuth token endpoint. */
	public const TOKEN_URL = JwtAssertion::AUDIENCE;

	/** JWT bearer grant type (RFC 7523). */
	public const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

	/** Longest a token is cached, in seconds. */
	public const CACHE_TTL = 50 * MINUTE_IN_SECONDS;

	/** HTTP timeout, in seconds. */
	public const TIMEOUT = 8;

	/** Transient name prefix (swept by the uninstaller's `imgsig_` pass). */
	public const TRANSIENT_PREFIX = 'imgsig_gmail_tok_';

	/**
	 * @var GmailSettings
	 */
	private GmailSettings $settings;

	/**
	 * @var Encryption
	 */
	private Encryption $encryption;

	/**
	 * @param GmailSettings $settings   Stored service account.
	 * @param Encryption    $encryption Wraps cached tokens.
	 */
	public function __construct( GmailSettings $settings, Encryption $encryption ) {
		$this->settings   = $settings;
		$this->encryption = $encryption;
	}

	/**
	 * Access token impersonating `$email`.
	 *
	 * @since 1.3.0
	 *
	 * @param string $email Workspace user.
	 * @param bool   $fresh Skip the cache (connection tests, after a 401).
	 *
	 * @return string
	 *
	 * @throws GmailException On any failure (diagnosed).
	 */
	public function access_token( string $email, bool $fresh = false ): string {
		$credentials = $this->settings->credentials();
		$cache_key   = $this->cache_key( $credentials, $email );

		if ( ! $fresh ) {
			$cached = get_transient( $cache_key );
			if ( is_string( $cached ) && '' !== $cached ) {
				try {
					$token = $this->encryption->decrypt( $cached );
					if ( '' !== $token ) {
						return $token;
					}
				} catch ( EncryptionException $e ) {
					delete_transient( $cache_key );
				}
			}
		}

		$assertion = JwtAssertion::build( $credentials, $email, GmailSettings::SCOPE, time() );

		$response = wp_safe_remote_post(
			self::TOKEN_URL,
			[
				'timeout'     => self::TIMEOUT,
				'redirection' => 0,
				'headers'     => [ 'Accept' => 'application/json' ],
				'body'        => [
					'grant_type' => self::GRANT_TYPE,
					'assertion'  => $assertion,
				],
			]
		);

		if ( is_wp_error( $response ) ) {
			$failure = GmailErrorMapper::transport( $response->get_error_message() );
			throw $failure;
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$body   = (string) wp_remote_retrieve_body( $response );

		if ( 200 !== $status ) {
			$failure = GmailErrorMapper::from_token_response(
				$status,
				$body,
				GmailErrorMapper::parse_retry_after( wp_remote_retrieve_header( $response, 'retry-after' ) ),
				$credentials->client_id,
				$email
			);
			throw $failure;
		}

		$data  = json_decode( $body, true );
		$token = is_array( $data ) && is_string( $data['access_token'] ?? null ) ? $data['access_token'] : '';
		if ( '' === $token ) {
			throw new GmailException(
				GmailException::INVALID_RESPONSE,
				__( 'Google answered the token request without an access token.', 'imagina-signatures' ),
				$status
			);
		}

		$expires_in = is_array( $data ) && isset( $data['expires_in'] ) ? (int) $data['expires_in'] : JwtAssertion::LIFETIME;
		$ttl        = min( self::CACHE_TTL, max( MINUTE_IN_SECONDS, $expires_in - 5 * MINUTE_IN_SECONDS ) );

		try {
			set_transient( $cache_key, $this->encryption->encrypt( $token ), $ttl );
		} catch ( EncryptionException $e ) {
			// Uncached is fine — the next call simply exchanges again.
			unset( $e );
		}

		return $token;
	}

	/**
	 * Drops the cached token for `$email` (after a 401).
	 *
	 * @since 1.3.0
	 *
	 * @param string $email Workspace user.
	 *
	 * @return void
	 */
	public function forget( string $email ): void {
		if ( ! $this->settings->is_configured() ) {
			return;
		}
		try {
			delete_transient( $this->cache_key( $this->settings->credentials(), $email ) );
		} catch ( GmailException $e ) {
			unset( $e );
		}
	}

	/**
	 * Transient name for one (service account, key, user). Uploading a
	 * different key changes every name, so tokens minted with the old
	 * key are never reused.
	 *
	 * @param GmailCredentials $credentials Service account.
	 * @param string           $email       User.
	 *
	 * @return string
	 */
	private function cache_key( GmailCredentials $credentials, string $email ): string {
		$key_digest = hash( 'sha256', $credentials->private_key );
		return self::TRANSIENT_PREFIX . substr(
			hash( 'sha256', $credentials->client_email . '|' . $key_digest . '|' . strtolower( trim( $email ) ) ),
			0,
			40
		);
	}
}
