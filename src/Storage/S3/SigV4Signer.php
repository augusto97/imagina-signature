<?php
/**
 * AWS Signature V4 signer (presigned URLs and signed requests).
 *
 * @package ImaginaSignatures\Storage\S3
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\S3;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Minimal SigV4 signer for S3 and S3-compatible providers.
 *
 * Implements only what the plugin needs: presigned PUT URLs for browser
 * uploads, plus signed PUT/DELETE requests issued from the server. No SDK
 * dependencies — the implementation follows the SigV4 spec directly.
 *
 * @since 1.0.0
 */
final class SigV4Signer {

	private const ALGORITHM      = 'AWS4-HMAC-SHA256';
	private const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
	private const SERVICE        = 's3';

	private string $access_key;
	private string $secret_key;
	private string $region;

	/**
	 * @param string $access_key Access key ID.
	 * @param string $secret_key Secret access key.
	 * @param string $region     Region label.
	 */
	public function __construct( string $access_key, string $secret_key, string $region ) {
		$this->access_key = $access_key;
		$this->secret_key = $secret_key;
		$this->region     = $region;
	}

	/**
	 * Builds a presigned URL for the given method, host, and path.
	 *
	 * @param string                $method          HTTP verb (GET, PUT, DELETE).
	 * @param string                $host            Host header value.
	 * @param string                $canonical_uri   URI starting with `/`.
	 * @param int                   $expires_seconds Expiration window.
	 * @param array<string, string> $extra_headers   Headers to include in the signature.
	 * @param int|null              $now             Override clock (for tests).
	 *
	 * @return string Fully-qualified URL with query-string signature.
	 */
	public function presign(
		string $method,
		string $host,
		string $canonical_uri,
		int $expires_seconds,
		array $extra_headers = [],
		?int $now = null
	): string {
		$now      = $now ?? time();
		$amz_date = gmdate( 'Ymd\THis\Z', $now );
		$date     = gmdate( 'Ymd', $now );

		$credential = $this->access_key . '/' . $date . '/' . $this->region . '/' . self::SERVICE . '/aws4_request';

		$signed_headers_map        = array_merge( [ 'host' => $host ], $this->normalize_headers( $extra_headers ) );
		ksort( $signed_headers_map );
		$signed_headers_list       = implode( ';', array_keys( $signed_headers_map ) );

		$query_params = [
			'X-Amz-Algorithm'     => self::ALGORITHM,
			'X-Amz-Credential'    => $credential,
			'X-Amz-Date'          => $amz_date,
			'X-Amz-Expires'       => (string) $expires_seconds,
			'X-Amz-SignedHeaders' => $signed_headers_list,
		];
		ksort( $query_params );

		$canonical_query = $this->build_canonical_query( $query_params );

		$canonical_headers = '';
		foreach ( $signed_headers_map as $name => $value ) {
			$canonical_headers .= $name . ':' . trim( $value ) . "\n";
		}

		$canonical_request = $method . "\n"
			. $canonical_uri . "\n"
			. $canonical_query . "\n"
			. $canonical_headers . "\n"
			. $signed_headers_list . "\n"
			. self::UNSIGNED_PAYLOAD;

		$string_to_sign = self::ALGORITHM . "\n"
			. $amz_date . "\n"
			. $date . '/' . $this->region . '/' . self::SERVICE . "/aws4_request\n"
			. hash( 'sha256', $canonical_request );

		$signing_key = $this->derive_signing_key( $date );
		$signature   = hash_hmac( 'sha256', $string_to_sign, $signing_key );

		$query_params['X-Amz-Signature'] = $signature;

		return 'https://' . $host . $canonical_uri . '?' . $this->build_canonical_query( $query_params );
	}

	/**
	 * Signs a request and returns the headers to include.
	 *
	 * @param string                $method        HTTP method.
	 * @param string                $host          Host header.
	 * @param string                $canonical_uri URI.
	 * @param string                $payload       Request body.
	 * @param array<string, string> $extra_headers Headers to include.
	 * @param int|null              $now           Override clock (for tests).
	 *
	 * @return array<string, string>
	 */
	public function sign_request(
		string $method,
		string $host,
		string $canonical_uri,
		string $payload,
		array $extra_headers = [],
		?int $now = null
	): array {
		$now              = $now ?? time();
		$amz_date         = gmdate( 'Ymd\THis\Z', $now );
		$date             = gmdate( 'Ymd', $now );
		$payload_hash     = hash( 'sha256', $payload );
		$normalized_extra = $this->normalize_headers( $extra_headers );
		$normalized       = array_merge(
			[
				'host'                 => $host,
				'x-amz-content-sha256' => $payload_hash,
				'x-amz-date'           => $amz_date,
			],
			$normalized_extra
		);
		ksort( $normalized );

		$signed_headers_list = implode( ';', array_keys( $normalized ) );
		$canonical_headers   = '';
		foreach ( $normalized as $name => $value ) {
			$canonical_headers .= $name . ':' . trim( $value ) . "\n";
		}

		$canonical_request = $method . "\n"
			. $canonical_uri . "\n"
			. '' . "\n"
			. $canonical_headers . "\n"
			. $signed_headers_list . "\n"
			. $payload_hash;

		$string_to_sign = self::ALGORITHM . "\n"
			. $amz_date . "\n"
			. $date . '/' . $this->region . '/' . self::SERVICE . "/aws4_request\n"
			. hash( 'sha256', $canonical_request );

		$signing_key = $this->derive_signing_key( $date );
		$signature   = hash_hmac( 'sha256', $string_to_sign, $signing_key );
		$credential  = $this->access_key . '/' . $date . '/' . $this->region . '/' . self::SERVICE . '/aws4_request';

		$auth_header = self::ALGORITHM . ' '
			. 'Credential=' . $credential . ', '
			. 'SignedHeaders=' . $signed_headers_list . ', '
			. 'Signature=' . $signature;

		$headers = [
			'Authorization'        => $auth_header,
			'x-amz-date'           => $amz_date,
			'x-amz-content-sha256' => $payload_hash,
		];

		foreach ( $normalized_extra as $name => $value ) {
			$headers[ $name ] = $value;
		}

		return $headers;
	}

	/**
	 * Lower-cases header names and trims values.
	 *
	 * @param array<string, string> $headers Headers.
	 *
	 * @return array<string, string>
	 */
	private function normalize_headers( array $headers ): array {
		$out = [];
		foreach ( $headers as $name => $value ) {
			$out[ strtolower( $name ) ] = trim( (string) $value );
		}
		return $out;
	}

	/**
	 * Builds the canonical query string per SigV4.
	 *
	 * @param array<string, string> $params Query parameters.
	 *
	 * @return string
	 */
	private function build_canonical_query( array $params ): string {
		$pairs = [];
		foreach ( $params as $name => $value ) {
			$pairs[] = rawurlencode( (string) $name ) . '=' . rawurlencode( (string) $value );
		}
		return implode( '&', $pairs );
	}

	/**
	 * Derives the signing key for a given date.
	 *
	 * @param string $date Date in YYYYMMDD form.
	 *
	 * @return string Raw signing key bytes.
	 */
	private function derive_signing_key( string $date ): string {
		$k_date    = hash_hmac( 'sha256', $date, 'AWS4' . $this->secret_key, true );
		$k_region  = hash_hmac( 'sha256', $this->region, $k_date, true );
		$k_service = hash_hmac( 'sha256', self::SERVICE, $k_region, true );
		return hash_hmac( 'sha256', 'aws4_request', $k_service, true );
	}
}
