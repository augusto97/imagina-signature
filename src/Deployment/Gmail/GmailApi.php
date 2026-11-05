<?php
/**
 * Minimal Gmail API client (send-as settings).
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

defined( 'ABSPATH' ) || exit;

/**
 * The two Gmail API calls the integration needs, made with the WordPress
 * HTTP API (`wp_safe_remote_request()`, no redirects, short timeout):
 *
 *  - `GET   users/{user}/settings/sendAs`          list addresses.
 *  - `PATCH users/{user}/settings/sendAs/{address}` set `signature`.
 *
 * A 401 drops the cached token and retries once with a fresh one;
 * every other failure is diagnosed by {@see GmailErrorMapper}.
 *
 * Not `final` so PHPUnit can double it.
 *
 * @since 1.3.0
 */
class GmailApi {

	/** API base for user resources. */
	public const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/';

	/** HTTP timeout, in seconds. */
	public const TIMEOUT = 8;

	/**
	 * @var GmailTokenClient
	 */
	private GmailTokenClient $tokens;

	/**
	 * @var GmailSettings
	 */
	private GmailSettings $settings;

	/**
	 * @param GmailTokenClient $tokens   Token source.
	 * @param GmailSettings    $settings Settings (project ID for diagnoses).
	 */
	public function __construct( GmailTokenClient $tokens, GmailSettings $settings ) {
		$this->tokens   = $tokens;
		$this->settings = $settings;
	}

	/**
	 * Send-as addresses of a user.
	 *
	 * @since 1.3.0
	 *
	 * @param string $user_email  Impersonated user.
	 * @param bool   $fresh_token Bypass the token cache (connection test).
	 *
	 * @return array<int, array{email: string, display_name: string, is_primary: bool, is_default: bool, verification_status: string}>
	 *
	 * @throws GmailException On failure.
	 */
	public function list_send_as( string $user_email, bool $fresh_token = false ): array {
		$data = $this->request( 'GET', $user_email, 'settings/sendAs', null, $fresh_token, $user_email );

		$out = [];
		foreach ( (array) ( $data['sendAs'] ?? [] ) as $entry ) {
			if ( ! is_array( $entry ) || ! is_string( $entry['sendAsEmail'] ?? null ) ) {
				continue;
			}
			$out[] = [
				'email'               => strtolower( $entry['sendAsEmail'] ),
				'display_name'        => is_string( $entry['displayName'] ?? null ) ? $entry['displayName'] : '',
				'is_primary'          => ! empty( $entry['isPrimary'] ),
				'is_default'          => ! empty( $entry['isDefault'] ),
				'verification_status' => is_string( $entry['verificationStatus'] ?? null ) ? $entry['verificationStatus'] : '',
			];
		}
		return $out;
	}

	/**
	 * Sets the signature of one send-as address.
	 *
	 * @since 1.3.0
	 *
	 * @param string $user_email    Impersonated user.
	 * @param string $send_as_email Address to update (the user's own = primary).
	 * @param string $html          Signature HTML.
	 *
	 * @return void
	 *
	 * @throws GmailException On failure.
	 */
	public function update_signature( string $user_email, string $send_as_email, string $html ): void {
		$this->request(
			'PATCH',
			$user_email,
			'settings/sendAs/' . rawurlencode( strtolower( $send_as_email ) ),
			[ 'signature' => $html ],
			false,
			$send_as_email
		);
	}

	/**
	 * Executes one API call.
	 *
	 * @param string                    $method      HTTP method.
	 * @param string                    $user_email  Impersonated user.
	 * @param string                    $path        Path below `users/{user}/`.
	 * @param array<string, mixed>|null $json        JSON body.
	 * @param bool                      $fresh_token Bypass the token cache.
	 * @param string                    $subject     Address named in error messages.
	 *
	 * @return array<string, mixed> Decoded body.
	 *
	 * @throws GmailException On failure.
	 */
	private function request( string $method, string $user_email, string $path, ?array $json, bool $fresh_token, string $subject ): array {
		$token = $this->tokens->access_token( $user_email, $fresh_token );

		$args = [
			'method'      => $method,
			'timeout'     => self::TIMEOUT,
			'redirection' => 0,
			'headers'     => [
				'Authorization' => 'Bearer ' . $token,
				'Accept'        => 'application/json',
			],
		];
		if ( null !== $json ) {
			$encoded = wp_json_encode( $json );
			if ( ! is_string( $encoded ) ) {
				throw new GmailException(
					GmailException::BAD_REQUEST,
					__( 'The signature HTML could not be encoded for Gmail (invalid characters).', 'imagina-signatures' )
				);
			}
			$args['headers']['Content-Type'] = 'application/json; charset=utf-8';
			$args['body']                    = $encoded;
		}

		$response = wp_safe_remote_request( self::BASE_URL . rawurlencode( strtolower( $user_email ) ) . '/' . $path, $args );

		if ( is_wp_error( $response ) ) {
			$failure = GmailErrorMapper::transport( $response->get_error_message() );
			throw $failure;
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$body   = (string) wp_remote_retrieve_body( $response );

		if ( 401 === $status && ! $fresh_token ) {
			$this->tokens->forget( $user_email );
			return $this->request( $method, $user_email, $path, $json, true, $subject );
		}

		if ( $status < 200 || $status >= 300 ) {
			$failure = GmailErrorMapper::from_api_response(
				$status,
				$body,
				GmailErrorMapper::parse_retry_after( wp_remote_retrieve_header( $response, 'retry-after' ) ),
				$subject,
				$this->settings->project_id()
			);
			throw $failure;
		}

		$data = json_decode( $body, true );
		return is_array( $data ) ? $data : [];
	}
}
