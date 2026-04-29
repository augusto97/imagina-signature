<?php
/**
 * Minimal S3-compatible HTTP client.
 *
 * @package ImaginaSignatures\Storage\S3
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\S3;

use ImaginaSignatures\Exceptions\StorageException;

defined( 'ABSPATH' ) || exit;

/**
 * Small HTTP client over the WordPress HTTP API with SigV4 auth.
 *
 * Covers the three operations the storage driver actually performs from
 * the server: HEAD bucket (test_connection), DELETE object, PUT object
 * (server-side fallback when presigned uploads aren't usable). Uses
 * path-style URLs for cross-provider compatibility.
 *
 * Network and authentication failures are translated to
 * {@see StorageException}; HTTP non-2xx responses are NOT translated —
 * the relevant request methods return the response array so callers
 * can decide what counts as failure (404 on delete is fine, 404 on
 * head_bucket is not).
 *
 * @since 1.0.0
 */
final class S3Client {

	/**
	 * Configured signer.
	 *
	 * @var SigV4Signer
	 */
	private SigV4Signer $signer;

	/**
	 * Endpoint URL with no trailing slash.
	 *
	 * @var string
	 */
	private string $endpoint;

	/**
	 * Bucket name.
	 *
	 * @var string
	 */
	private string $bucket;

	/**
	 * Default request timeout in seconds.
	 *
	 * @var int
	 */
	private int $timeout = 15;

	/**
	 * @param SigV4Signer $signer   Configured signer.
	 * @param string      $endpoint Endpoint URL (with scheme).
	 * @param string      $bucket   Bucket name.
	 */
	public function __construct( SigV4Signer $signer, string $endpoint, string $bucket ) {
		$this->signer   = $signer;
		$this->endpoint = rtrim( $endpoint, '/' );
		$this->bucket   = $bucket;
	}

	/**
	 * HEADs the configured bucket.
	 *
	 * Used by `test_connection`. A 200 response means credentials and
	 * endpoint are correct; 403 / 404 / 401 indicate misconfiguration;
	 * connection-level failure surfaces as a StorageException.
	 *
	 * @since 1.0.0
	 *
	 * @return array{code: int, body: string, headers: array<string, string>}
	 *
	 * @throws StorageException On HTTP transport failure.
	 */
	public function head_bucket(): array {
		$url     = sprintf( '%s/%s', $this->endpoint, rawurlencode( $this->bucket ) );
		$headers = $this->signer->sign_request( 'HEAD', $url );

		return $this->execute( 'HEAD', $url, $headers );
	}

	/**
	 * Deletes a single object.
	 *
	 * Returns the response array — callers should treat 204 / 404 as
	 * success (the post-condition is the same: the object is gone).
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Object key.
	 *
	 * @return array{code: int, body: string, headers: array<string, string>}
	 *
	 * @throws StorageException On HTTP transport failure.
	 */
	public function delete_object( string $key ): array {
		$url     = $this->object_url( $key );
		$headers = $this->signer->sign_request( 'DELETE', $url );

		return $this->execute( 'DELETE', $url, $headers );
	}

	/**
	 * Uploads an object server-side (PUT with body).
	 *
	 * Used as a fallback when presigned uploads aren't suitable. The
	 * full body is read into memory by the WP HTTP API; callers should
	 * limit this to small payloads (a few MB).
	 *
	 * @since 1.0.0
	 *
	 * @param string $key          Destination object key.
	 * @param string $body         Raw body bytes.
	 * @param string $content_type IANA mime type.
	 *
	 * @return array{code: int, body: string, headers: array<string, string>}
	 *
	 * @throws StorageException On HTTP transport failure.
	 */
	public function put_object( string $key, string $body, string $content_type ): array {
		$url     = $this->object_url( $key );
		$headers = $this->signer->sign_request(
			'PUT',
			$url,
			[ 'content-type' => $content_type ],
			$body
		);

		return $this->execute( 'PUT', $url, $headers, $body );
	}

	/**
	 * Builds the path-style URL for an object key.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Object key.
	 *
	 * @return string
	 */
	private function object_url( string $key ): string {
		$encoded_key = implode(
			'/',
			array_map(
				static function ( string $segment ): string {
					return rawurlencode( rawurldecode( $segment ) );
				},
				explode( '/', ltrim( $key, '/' ) )
			)
		);

		return sprintf(
			'%s/%s/%s',
			$this->endpoint,
			rawurlencode( $this->bucket ),
			$encoded_key
		);
	}

	/**
	 * Executes the HTTP request via the WordPress HTTP API.
	 *
	 * @since 1.0.0
	 *
	 * @param string                $method  HTTP method.
	 * @param string                $url     Full URL.
	 * @param array<string, string> $headers Headers (must already include the `Authorization`).
	 * @param string                $body    Optional request body.
	 *
	 * @return array{code: int, body: string, headers: array<string, string>}
	 *
	 * @throws StorageException On transport-level failure.
	 */
	private function execute( string $method, string $url, array $headers, string $body = '' ): array {
		$response = wp_remote_request(
			$url,
			[
				'method'      => $method,
				'headers'     => $headers,
				'body'        => $body,
				'timeout'     => $this->timeout,
				'redirection' => 0,
				'sslverify'   => true,
			]
		);

		if ( is_wp_error( $response ) ) {
			throw new StorageException( 'S3 HTTP request failed: ' . $response->get_error_message() );
		}

		$response_headers = [];
		$raw_headers      = wp_remote_retrieve_headers( $response );
		if ( is_object( $raw_headers ) && method_exists( $raw_headers, 'getAll' ) ) {
			foreach ( $raw_headers->getAll() as $name => $value ) {
				$response_headers[ strtolower( (string) $name ) ] = is_array( $value )
					? implode( ', ', $value )
					: (string) $value;
			}
		} elseif ( is_array( $raw_headers ) ) {
			foreach ( $raw_headers as $name => $value ) {
				$response_headers[ strtolower( (string) $name ) ] = is_array( $value )
					? implode( ', ', $value )
					: (string) $value;
			}
		}

		return [
			'code'    => (int) wp_remote_retrieve_response_code( $response ),
			'body'    => (string) wp_remote_retrieve_body( $response ),
			'headers' => $response_headers,
		];
	}
}
