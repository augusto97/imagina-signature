<?php
/**
 * Maps Google error responses to actionable diagnoses.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

defined( 'ABSPATH' ) || exit;

/**
 * Turns Google OAuth / Gmail API error bodies into {@see GmailException}s
 * whose message tells the admin exactly what to change.
 *
 * The common setup mistakes and how Google reports them:
 *
 *  | Problem                               | Where  | Google says                                        | Reason               |
 *  |---------------------------------------|--------|----------------------------------------------------|----------------------|
 *  | Delegation missing / scope not listed | token  | 401 `unauthorized_client`                          | `delegation_missing` |
 *  | User not in the Workspace / alias     | token  | 400 `invalid_grant` "Invalid email or User ID"     | `user_not_found`     |
 *  | Key deleted / rotated                 | token  | 400 `invalid_grant` "Invalid JWT Signature."       | `invalid_key`        |
 *  | Server clock off                      | token  | 400 `invalid_grant` "…iat and exp values…"         | `clock_skew`         |
 *  | Service account deleted / disabled    | token  | 401 `invalid_client` / `disabled_client`           | `invalid_client`     |
 *  | Gmail API not enabled in the project  | API    | 403 SERVICE_DISABLED / accessNotConfigured         | `api_disabled`       |
 *  | Token lacks the scope                 | API    | 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT                | `wrong_scope`        |
 *  | User without Gmail                    | API    | 400 failedPrecondition "Mail service not enabled"  | `mail_disabled`      |
 *  | Rate limit                            | either | 429, or 403 rateLimitExceeded                      | `rate_limited` ↻     |
 *  | Google outage                         | either | 5xx                                                | `server_error` ↻     |
 *
 * ↻ = retryable.
 *
 * @since 1.3.0
 */
final class GmailErrorMapper {

	/** Google error text kept for display (characters). */
	private const MAX_GOOGLE_MESSAGE = 500;

	/**
	 * Maps a failed token exchange.
	 *
	 * @since 1.3.0
	 *
	 * @param int    $status      HTTP status.
	 * @param string $body        Response body.
	 * @param int    $retry_after `Retry-After` seconds (0 = none).
	 * @param string $client_id   Service-account client ID (for the hint).
	 * @param string $email       Impersonated user.
	 *
	 * @return GmailException
	 */
	public static function from_token_response( int $status, string $body, int $retry_after, string $client_id, string $email ): GmailException {
		$data        = json_decode( $body, true );
		$error       = is_array( $data ) && is_string( $data['error'] ?? null ) ? $data['error'] : '';
		$description = is_array( $data ) && is_string( $data['error_description'] ?? null ) ? $data['error_description'] : '';
		$google      = self::clip( trim( $error . ( '' !== $description ? ': ' . $description : '' ) ) );
		if ( '' === $google ) {
			$google = self::clip( wp_strip_all_tags( $body ) );
		}

		if ( 429 === $status ) {
			return self::rate_limited( $status, $retry_after, $google );
		}
		if ( $status >= 500 ) {
			return self::server_error( $status, $retry_after, $google );
		}

		$admin_url = 'https://admin.google.com/ac/owl/domainwidedelegation';

		if ( 'unauthorized_client' === $error || 'access_denied' === $error ) {
			return new GmailException(
				GmailException::DELEGATION_MISSING,
				sprintf(
					/* translators: 1: user email, 2: numeric client ID, 3: OAuth scope URL. */
					__( 'Google refused to act on behalf of %1$s: domain-wide delegation is not granted to this service account, or not with the right scope. In the Google Admin console go to Security → API controls → Domain-wide delegation and add client ID %2$s with the scope %3$s (changes can take a few minutes to apply).', 'imagina-signatures' ),
					$email,
					$client_id,
					GmailSettings::SCOPE
				),
				$status,
				false,
				0,
				$google,
				$admin_url
			);
		}

		if ( 'invalid_client' === $error || 'disabled_client' === $error || false !== stripos( $description, 'account not found' ) ) {
			return new GmailException(
				GmailException::INVALID_CLIENT,
				__( 'Google does not recognise this service account: it was deleted or disabled. Check it in Google Cloud → IAM & Admin → Service accounts, then upload a fresh JSON key.', 'imagina-signatures' ),
				$status,
				false,
				0,
				$google,
				'https://console.cloud.google.com/iam-admin/serviceaccounts'
			);
		}

		if ( 'invalid_grant' === $error ) {
			if ( false !== stripos( $description, 'email' ) || false !== stripos( $description, 'user id' ) ) {
				return new GmailException(
					GmailException::USER_NOT_FOUND,
					sprintf(
						/* translators: %s: user email. */
						__( '%s is not a user of the Google Workspace that granted the delegation. Check the address (use the primary address, not an alias) and that the user belongs to your domain.', 'imagina-signatures' ),
						$email
					),
					$status,
					false,
					0,
					$google
				);
			}
			if ( false !== stripos( $description, 'signature' ) ) {
				return new GmailException(
					GmailException::INVALID_KEY,
					__( 'Google rejected the key\'s signature: the key was probably deleted or rotated in Google Cloud. Create a new JSON key for the service account and upload it again.', 'imagina-signatures' ),
					$status,
					false,
					0,
					$google,
					'https://console.cloud.google.com/iam-admin/serviceaccounts'
				);
			}
			if ( false !== stripos( $description, 'iat' ) || false !== stripos( $description, 'exp' ) || false !== stripos( $description, 'short-lived' ) ) {
				return new GmailException(
					GmailException::CLOCK_SKEW,
					__( 'Google rejected the request\'s time window. This server\'s clock is probably wrong — ask your host to sync it (NTP).', 'imagina-signatures' ),
					$status,
					false,
					0,
					$google
				);
			}
		}

		return new GmailException(
			GmailException::TOKEN_REFUSED,
			sprintf(
				/* translators: %d: HTTP status code. */
				__( 'Google refused to issue an access token (HTTP %d).', 'imagina-signatures' ),
				$status
			),
			$status,
			false,
			0,
			$google
		);
	}

	/**
	 * Maps a failed Gmail API call.
	 *
	 * @since 1.3.0
	 *
	 * @param int    $status      HTTP status.
	 * @param string $body        Response body.
	 * @param int    $retry_after `Retry-After` seconds (0 = none).
	 * @param string $email       Address the call was about.
	 * @param string $project_id  Cloud project (for the "enable the API" link).
	 *
	 * @return GmailException
	 */
	public static function from_api_response( int $status, string $body, int $retry_after, string $email, string $project_id ): GmailException {
		$data    = json_decode( $body, true );
		$error   = is_array( $data ) && is_array( $data['error'] ?? null ) ? $data['error'] : [];
		$message = is_string( $error['message'] ?? null ) ? $error['message'] : '';
		$google  = self::clip( '' !== $message ? $message : wp_strip_all_tags( $body ) );

		$reasons = [];
		if ( is_string( $error['status'] ?? null ) ) {
			$reasons[] = strtolower( $error['status'] );
		}
		foreach ( [ 'errors', 'details' ] as $list ) {
			if ( ! is_array( $error[ $list ] ?? null ) ) {
				continue;
			}
			foreach ( $error[ $list ] as $item ) {
				if ( is_array( $item ) && is_string( $item['reason'] ?? null ) ) {
					$reasons[] = strtolower( $item['reason'] );
				}
			}
		}
		$has = static function ( string ...$needles ) use ( $reasons, $message ): bool {
			foreach ( $needles as $needle ) {
				if ( in_array( strtolower( $needle ), $reasons, true ) || false !== stripos( $message, $needle ) ) {
					return true;
				}
			}
			return false;
		};

		if ( 429 === $status || ( 403 === $status && $has( 'rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'RATE_LIMIT_EXCEEDED' ) ) ) {
			return self::rate_limited( $status, $retry_after, $google );
		}
		if ( $status >= 500 ) {
			return self::server_error( $status, $retry_after, $google );
		}

		if ( 401 === $status ) {
			return new GmailException(
				GmailException::UNAUTHORIZED,
				__( 'Google rejected the access token even after requesting a new one. Check that domain-wide delegation is still granted to the service account.', 'imagina-signatures' ),
				$status,
				false,
				0,
				$google
			);
		}

		if ( 403 === $status && $has( 'SERVICE_DISABLED', 'accessNotConfigured', 'has not been used in project', 'API has not been used', 'it is disabled' ) ) {
			$project = '' !== $project_id ? $project_id : __( '(your project)', 'imagina-signatures' );
			return new GmailException(
				GmailException::API_DISABLED,
				sprintf(
					/* translators: %s: Google Cloud project ID. */
					__( 'The Gmail API is not enabled in the Google Cloud project %s. Open APIs & Services → Library → Gmail API, click Enable, wait a few minutes and try again.', 'imagina-signatures' ),
					$project
				),
				$status,
				false,
				0,
				$google,
				'https://console.cloud.google.com/apis/library/gmail.googleapis.com' . ( '' !== $project_id ? '?project=' . rawurlencode( $project_id ) : '' )
			);
		}

		if ( 403 === $status && $has( 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'insufficientPermissions', 'insufficient authentication scopes' ) ) {
			return new GmailException(
				GmailException::WRONG_SCOPE,
				sprintf(
					/* translators: %s: OAuth scope URL. */
					__( 'The access token does not carry the scope Gmail needs. In the Google Admin console → Security → API controls → Domain-wide delegation, edit this client ID so its scopes include exactly %s.', 'imagina-signatures' ),
					GmailSettings::SCOPE
				),
				$status,
				false,
				0,
				$google,
				'https://admin.google.com/ac/owl/domainwidedelegation'
			);
		}

		if ( 403 === $status ) {
			return new GmailException(
				GmailException::FORBIDDEN,
				sprintf(
					/* translators: %s: user email. */
					__( 'Google refused to change the signature of %s (403). Gmail may be restricted for this user\'s organisational unit.', 'imagina-signatures' ),
					$email
				),
				$status,
				false,
				0,
				$google
			);
		}

		if ( 404 === $status ) {
			return new GmailException(
				GmailException::SEND_AS_NOT_FOUND,
				sprintf(
					/* translators: %s: email address. */
					__( 'Gmail has no mailbox or send-as address %s for this user.', 'imagina-signatures' ),
					$email
				),
				$status,
				false,
				0,
				$google
			);
		}

		if ( 400 === $status && $has( 'Mail service not enabled' ) ) {
			return new GmailException(
				GmailException::MAIL_DISABLED,
				sprintf(
					/* translators: %s: user email. */
					__( '%s has no Gmail service (no Google Workspace licence, or Gmail is turned off for their organisational unit).', 'imagina-signatures' ),
					$email
				),
				$status,
				false,
				0,
				$google
			);
		}

		if ( 400 === $status && $has( 'too long', 'too large' ) ) {
			return new GmailException(
				GmailException::TOO_LONG,
				__( 'Gmail rejected the signature because it is too long. Simplify the signature (fewer blocks, shorter texts) and try again.', 'imagina-signatures' ),
				$status,
				false,
				0,
				$google
			);
		}

		return new GmailException(
			GmailException::BAD_REQUEST,
			sprintf(
				/* translators: %d: HTTP status code. */
				__( 'Gmail rejected the request (HTTP %d).', 'imagina-signatures' ),
				$status
			),
			$status,
			false,
			0,
			$google
		);
	}

	/**
	 * Transport-level failure (DNS, TLS, timeout). Retryable.
	 *
	 * @since 1.3.0
	 *
	 * @param string $detail WP_Error message.
	 *
	 * @return GmailException
	 */
	public static function transport( string $detail ): GmailException {
		return new GmailException(
			GmailException::NETWORK,
			sprintf(
				/* translators: %s: transport error message. */
				__( 'Could not reach Google: %s', 'imagina-signatures' ),
				self::clip( $detail )
			),
			0,
			true
		);
	}

	/**
	 * Parses a `Retry-After` header value (seconds or HTTP date).
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $value Header value.
	 *
	 * @return int Seconds (0 when absent / unparseable), capped at a day.
	 */
	public static function parse_retry_after( $value ): int {
		if ( is_array( $value ) ) {
			$value = reset( $value );
		}
		$value = trim( (string) $value );
		if ( '' === $value ) {
			return 0;
		}
		if ( ctype_digit( $value ) ) {
			$seconds = (int) $value;
		} else {
			$at      = strtotime( $value );
			$seconds = false === $at ? 0 : $at - time();
		}
		return max( 0, min( DAY_IN_SECONDS, $seconds ) );
	}

	/**
	 * 429-style failure.
	 *
	 * @param int    $status      HTTP status.
	 * @param int    $retry_after Seconds.
	 * @param string $google      Google's text.
	 *
	 * @return GmailException
	 */
	private static function rate_limited( int $status, int $retry_after, string $google ): GmailException {
		return new GmailException(
			GmailException::RATE_LIMITED,
			__( 'Google is rate-limiting requests right now. The push will be retried automatically.', 'imagina-signatures' ),
			$status,
			true,
			$retry_after,
			$google
		);
	}

	/**
	 * 5xx failure.
	 *
	 * @param int    $status      HTTP status.
	 * @param int    $retry_after Seconds.
	 * @param string $google      Google's text.
	 *
	 * @return GmailException
	 */
	private static function server_error( int $status, int $retry_after, string $google ): GmailException {
		return new GmailException(
			GmailException::SERVER_ERROR,
			sprintf(
				/* translators: %d: HTTP status code. */
				__( 'Google returned a temporary error (HTTP %d). The push will be retried automatically.', 'imagina-signatures' ),
				$status
			),
			$status,
			true,
			$retry_after,
			$google
		);
	}

	/**
	 * Single-line, length-capped copy of Google's text.
	 *
	 * @param string $text Text.
	 *
	 * @return string
	 */
	private static function clip( string $text ): string {
		$text = trim( (string) preg_replace( '/\s+/', ' ', $text ) );
		if ( function_exists( 'mb_substr' ) ) {
			return mb_substr( $text, 0, self::MAX_GOOGLE_MESSAGE );
		}
		return substr( $text, 0, self::MAX_GOOGLE_MESSAGE );
	}
}
