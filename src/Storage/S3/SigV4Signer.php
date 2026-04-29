<?php
/**
 * AWS Signature Version 4 signer.
 *
 * @package ImaginaSignatures\Storage\S3
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\S3;

use ImaginaSignatures\Exceptions\StorageException;

defined( 'ABSPATH' ) || exit;

/**
 * Minimal AWS SigV4 signer for S3 requests.
 *
 * Implements the wire-level pieces of the SigV4 spec
 * (https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html)
 * scoped to what the S3 driver needs: signing arbitrary HTTP requests
 * (`sign_request`) and minting presigned URLs (`presign_url`).
 *
 * No AWS SDK at runtime (CLAUDE.md §2.4). This file should stay under
 * a few hundred lines and not grow features beyond S3 + path-style URLs.
 *
 * Caveats:
 *  - Path-style URLs only (https://endpoint/bucket/key). Virtual-hosted
 *    style is not implemented; the S3 driver constructs path-style URLs
 *    by convention for maximum provider compatibility.
 *  - SHA-256 of an empty payload is the well-known constant; non-empty
 *    bodies are hashed at sign time (memory-resident).
 *  - For browser-direct (presigned) PUTs, payload hash is `UNSIGNED-PAYLOAD`,
 *    which keeps the signature stable regardless of body bytes.
 *
 * @since 1.0.0
 */
final class SigV4Signer {

	private const ALGORITHM        = 'AWS4-HMAC-SHA256';
	private const SERVICE          = 's3';
	private const REQUEST_TYPE     = 'aws4_request';
	private const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

	/**
	 * SHA-256 of the empty string (well-known constant, used for GET / HEAD).
	 */
	private const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

	/**
	 * Access key ID.
	 *
	 * @var string
	 */
	private string $access_key;

	/**
	 * Secret access key.
	 *
	 * @var string
	 */
	private string $secret_key;

	/**
	 * Region used in the credential scope.
	 *
	 * @var string
	 */
	private string $region;

	/**
	 * @param string $access_key AWS-style access key ID.
	 * @param string $secret_key AWS-style secret access key.
	 * @param string $region     Provider region (e.g. `us-east-1`, `auto`).
	 */
	public function __construct( string $access_key, string $secret_key, string $region ) {
		$this->access_key = $access_key;
		$this->secret_key = $secret_key;
		$this->region     = $region;
	}

	/**
	 * Signs an HTTP request and returns the headers to send.
	 *
	 * The returned array always contains `host`, `x-amz-date`,
	 * `x-amz-content-sha256`, and `authorization`. Any caller-provided
	 * headers in `$headers` are merged in and counted as signed headers.
	 *
	 * @since 1.0.0
	 *
	 * @param string                $method    HTTP method (GET, PUT, DELETE, ...).
	 * @param string                $url       Full request URL.
	 * @param array<string, string> $headers   Caller-provided headers (host is auto-set).
	 * @param string                $payload   Request body (use empty string for GET/HEAD/DELETE).
	 * @param int|null              $timestamp Optional Unix timestamp override (for tests).
	 *
	 * @return array<string, string> Headers to send with the request, including `Authorization`.
	 *
	 * @throws StorageException When the URL cannot be parsed.
	 */
	public function sign_request(
		string $method,
		string $url,
		array $headers = [],
		string $payload = '',
		?int $timestamp = null
	): array {
		$timestamp  = $timestamp ?? time();
		$amz_date   = gmdate( 'Ymd\\THis\\Z', $timestamp );
		$date_stamp = gmdate( 'Ymd', $timestamp );

		$parts = $this->parse_url( $url );

		$payload_hash = '' === $payload ? self::EMPTY_BODY_HASH : hash( 'sha256', $payload );

		// Required signed headers, lower-cased to match canonicalisation.
		$signing_headers = $this->lowercase_keys( $headers );
		$signing_headers['host']                 = $parts['host'];
		$signing_headers['x-amz-date']           = $amz_date;
		$signing_headers['x-amz-content-sha256'] = $payload_hash;

		$canonical = $this->build_canonical_request(
			$method,
			$parts['path'],
			$parts['query'],
			$signing_headers,
			$payload_hash
		);

		$string_to_sign = $this->build_string_to_sign(
			$amz_date,
			$date_stamp,
			$canonical['canonical_request']
		);

		$signing_key = $this->derive_signing_key( $date_stamp );
		$signature   = hash_hmac( 'sha256', $string_to_sign, $signing_key );

		$signing_headers['authorization'] = sprintf(
			'%s Credential=%s/%s/%s/%s/%s, SignedHeaders=%s, Signature=%s',
			self::ALGORITHM,
			$this->access_key,
			$date_stamp,
			$this->region,
			self::SERVICE,
			self::REQUEST_TYPE,
			$canonical['signed_headers'],
			$signature
		);

		return $signing_headers;
	}

	/**
	 * Returns a presigned URL the browser can use directly.
	 *
	 * The signature lives in the query string, not the headers. Only
	 * `host` is signed (sufficient for browser PUT uploads). The payload
	 * hash is `UNSIGNED-PAYLOAD`.
	 *
	 * @since 1.0.0
	 *
	 * @param string                $method          HTTP method (typically `PUT`).
	 * @param string                $url             Target URL (without auth query parameters).
	 * @param int                   $expires_seconds Validity window in seconds.
	 * @param array<string, string> $extra_query     Extra query parameters to include in the signature.
	 * @param int|null              $timestamp       Optional Unix timestamp override (for tests).
	 *
	 * @return string Presigned URL.
	 *
	 * @throws StorageException When the URL cannot be parsed.
	 */
	public function presign_url(
		string $method,
		string $url,
		int $expires_seconds,
		array $extra_query = [],
		?int $timestamp = null
	): string {
		$timestamp  = $timestamp ?? time();
		$amz_date   = gmdate( 'Ymd\\THis\\Z', $timestamp );
		$date_stamp = gmdate( 'Ymd', $timestamp );

		$parts = $this->parse_url( $url );

		$credential_scope = sprintf(
			'%s/%s/%s/%s',
			$date_stamp,
			$this->region,
			self::SERVICE,
			self::REQUEST_TYPE
		);

		// Merge caller's existing query string with our auth parameters.
		$existing_query = [];
		if ( '' !== $parts['query'] ) {
			parse_str( $parts['query'], $existing_query );
		}

		$query_params = array_merge(
			$existing_query,
			$extra_query,
			[
				'X-Amz-Algorithm'     => self::ALGORITHM,
				'X-Amz-Credential'    => $this->access_key . '/' . $credential_scope,
				'X-Amz-Date'          => $amz_date,
				'X-Amz-Expires'       => (string) $expires_seconds,
				'X-Amz-SignedHeaders' => 'host',
			]
		);

		$query = http_build_query( $query_params, '', '&', PHP_QUERY_RFC3986 );

		$canonical = $this->build_canonical_request(
			$method,
			$parts['path'],
			$query,
			[ 'host' => $parts['host'] ],
			self::UNSIGNED_PAYLOAD
		);

		$string_to_sign = $this->build_string_to_sign(
			$amz_date,
			$date_stamp,
			$canonical['canonical_request']
		);

		$signing_key = $this->derive_signing_key( $date_stamp );
		$signature   = hash_hmac( 'sha256', $string_to_sign, $signing_key );

		$query_params['X-Amz-Signature'] = $signature;
		$final_query                     = http_build_query( $query_params, '', '&', PHP_QUERY_RFC3986 );

		return sprintf(
			'%s://%s%s?%s',
			$parts['scheme'],
			$parts['host'],
			$parts['path'],
			$final_query
		);
	}

	/**
	 * Builds the SigV4 canonical request and the SignedHeaders string.
	 *
	 * @since 1.0.0
	 *
	 * @param string                $method       HTTP method.
	 * @param string                $path         URL path (already URL-decoded).
	 * @param string                $query        Raw query string.
	 * @param array<string, string> $headers      Headers to sign.
	 * @param string                $payload_hash Hex SHA-256 of the body (or `UNSIGNED-PAYLOAD`).
	 *
	 * @return array{canonical_request: string, signed_headers: string}
	 */
	private function build_canonical_request(
		string $method,
		string $path,
		string $query,
		array $headers,
		string $payload_hash
	): array {
		$headers_data = $this->canonical_headers( $headers );

		$canonical = implode(
			"\n",
			[
				strtoupper( $method ),
				$this->canonical_uri( $path ),
				$this->canonical_query( $query ),
				$headers_data['canonical_headers'],
				$headers_data['signed_headers'],
				$payload_hash,
			]
		);

		return [
			'canonical_request' => $canonical,
			'signed_headers'    => $headers_data['signed_headers'],
		];
	}

	/**
	 * Builds the SigV4 string-to-sign.
	 *
	 * @since 1.0.0
	 *
	 * @param string $amz_date          ISO8601 basic format (`YYYYMMDDTHHMMSSZ`).
	 * @param string $date_stamp        Date portion (`YYYYMMDD`).
	 * @param string $canonical_request Canonical request string.
	 *
	 * @return string
	 */
	private function build_string_to_sign( string $amz_date, string $date_stamp, string $canonical_request ): string {
		$credential_scope = sprintf( '%s/%s/%s/%s', $date_stamp, $this->region, self::SERVICE, self::REQUEST_TYPE );

		return implode(
			"\n",
			[
				self::ALGORITHM,
				$amz_date,
				$credential_scope,
				hash( 'sha256', $canonical_request ),
			]
		);
	}

	/**
	 * Derives the per-request signing key (HMAC chain).
	 *
	 * @since 1.0.0
	 *
	 * @param string $date_stamp Date portion (`YYYYMMDD`).
	 *
	 * @return string Raw bytes (32 bytes).
	 */
	private function derive_signing_key( string $date_stamp ): string {
		$k_date    = hash_hmac( 'sha256', $date_stamp, 'AWS4' . $this->secret_key, true );
		$k_region  = hash_hmac( 'sha256', $this->region, $k_date, true );
		$k_service = hash_hmac( 'sha256', self::SERVICE, $k_region, true );
		return hash_hmac( 'sha256', self::REQUEST_TYPE, $k_service, true );
	}

	/**
	 * Canonicalises the URI path per S3 rules (single URL-encode, slashes preserved).
	 *
	 * @since 1.0.0
	 *
	 * @param string $path URL path.
	 *
	 * @return string
	 */
	private function canonical_uri( string $path ): string {
		if ( '' === $path || '/' === $path ) {
			return '/';
		}

		$segments = explode( '/', $path );
		$encoded  = array_map(
			static function ( string $segment ): string {
				// rawurldecode then rawurlencode normalises any pre-encoded segments.
				return rawurlencode( rawurldecode( $segment ) );
			},
			$segments
		);

		return implode( '/', $encoded );
	}

	/**
	 * Canonicalises the query string (sorted, RFC3986-encoded).
	 *
	 * @since 1.0.0
	 *
	 * @param string $query Raw query string.
	 *
	 * @return string
	 */
	private function canonical_query( string $query ): string {
		if ( '' === $query ) {
			return '';
		}

		$pairs = [];
		foreach ( explode( '&', $query ) as $pair ) {
			$parts                                  = explode( '=', $pair, 2 );
			$key                                    = rawurldecode( $parts[0] );
			$value                                  = isset( $parts[1] ) ? rawurldecode( $parts[1] ) : '';
			$pairs[]                                = [
				'k' => rawurlencode( $key ),
				'v' => rawurlencode( $value ),
			];
		}

		usort(
			$pairs,
			static function ( array $a, array $b ): int {
				$cmp = strcmp( $a['k'], $b['k'] );
				return 0 !== $cmp ? $cmp : strcmp( $a['v'], $b['v'] );
			}
		);

		$out = [];
		foreach ( $pairs as $pair ) {
			$out[] = $pair['k'] . '=' . $pair['v'];
		}

		return implode( '&', $out );
	}

	/**
	 * Canonicalises the header set (lower-cased names, trimmed values, sorted).
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, string> $headers Raw headers.
	 *
	 * @return array{canonical_headers: string, signed_headers: string}
	 */
	private function canonical_headers( array $headers ): array {
		$normalized = [];
		foreach ( $headers as $name => $value ) {
			$key                    = strtolower( trim( (string) $name ) );
			$val                    = is_array( $value ) ? implode( ',', $value ) : (string) $value;
			$val                    = (string) preg_replace( '/\s+/', ' ', trim( $val ) );
			$normalized[ $key ][]   = $val;
		}

		ksort( $normalized );

		$canonical = '';
		$signed    = [];
		foreach ( $normalized as $key => $values ) {
			$canonical .= $key . ':' . implode( ',', $values ) . "\n";
			$signed[]   = $key;
		}

		return [
			'canonical_headers' => $canonical,
			'signed_headers'    => implode( ';', $signed ),
		];
	}

	/**
	 * Lower-cases the keys of an associative array.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, string> $headers Header map.
	 *
	 * @return array<string, string>
	 */
	private function lowercase_keys( array $headers ): array {
		$out = [];
		foreach ( $headers as $name => $value ) {
			$out[ strtolower( (string) $name ) ] = (string) $value;
		}
		return $out;
	}

	/**
	 * Parses a URL into the parts SigV4 needs.
	 *
	 * @since 1.0.0
	 *
	 * @param string $url Full URL.
	 *
	 * @return array{scheme: string, host: string, path: string, query: string}
	 *
	 * @throws StorageException When the URL is unparseable.
	 */
	private function parse_url( string $url ): array {
		$parts = parse_url( $url );
		if ( false === $parts || empty( $parts['host'] ) ) {
			throw new StorageException( 'Invalid URL passed to SigV4Signer: ' . $url );
		}

		$host = (string) $parts['host'];
		if ( isset( $parts['port'] ) ) {
			$host .= ':' . (string) $parts['port'];
		}

		return [
			'scheme' => isset( $parts['scheme'] ) ? (string) $parts['scheme'] : 'https',
			'host'   => $host,
			'path'   => isset( $parts['path'] ) ? (string) $parts['path'] : '/',
			'query'  => isset( $parts['query'] ) ? (string) $parts['query'] : '',
		];
	}
}
