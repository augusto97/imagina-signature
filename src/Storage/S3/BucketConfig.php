<?php
/**
 * Value object describing an S3 bucket connection.
 *
 * @package ImaginaSignatures\Storage\S3
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\S3;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Immutable bucket configuration.
 *
 * Most S3-compatible providers fit this shape; provider-specific quirks
 * (path-style addressing for MinIO, custom endpoints, etc.) live in the
 * caller, not here.
 *
 * @since 1.0.0
 */
final class BucketConfig {

	public string $endpoint;
	public string $region;
	public string $bucket;
	public string $access_key;
	public string $secret_key;
	public bool $path_style;
	public string $public_base_url;

	/**
	 * @param string $endpoint        Endpoint URL (no trailing slash).
	 * @param string $region          Region (`auto`, `us-east-1`, …).
	 * @param string $bucket          Bucket name.
	 * @param string $access_key      Access key ID.
	 * @param string $secret_key      Secret access key.
	 * @param bool   $path_style      Whether to use path-style addressing.
	 * @param string $public_base_url Optional CDN/public URL prefix.
	 */
	public function __construct(
		string $endpoint,
		string $region,
		string $bucket,
		string $access_key,
		string $secret_key,
		bool $path_style = false,
		string $public_base_url = ''
	) {
		$this->endpoint        = rtrim( $endpoint, '/' );
		$this->region          = $region;
		$this->bucket          = $bucket;
		$this->access_key      = $access_key;
		$this->secret_key      = $secret_key;
		$this->path_style      = $path_style;
		$this->public_base_url = rtrim( $public_base_url, '/' );
	}

	/**
	 * Builds a config from a serialized array.
	 *
	 * @param array<string, mixed> $data Raw config values.
	 *
	 * @return self
	 */
	public static function from_array( array $data ): self {
		return new self(
			(string) ( $data['endpoint'] ?? '' ),
			(string) ( $data['region'] ?? 'auto' ),
			(string) ( $data['bucket'] ?? '' ),
			(string) ( $data['access_key'] ?? '' ),
			(string) ( $data['secret_key'] ?? '' ),
			! empty( $data['path_style'] ),
			(string) ( $data['public_base_url'] ?? '' )
		);
	}

	/**
	 * Returns the host portion of the bucket endpoint (no protocol).
	 *
	 * @return string
	 */
	public function get_host(): string {
		$parts = wp_parse_url( $this->endpoint );
		return is_array( $parts ) && isset( $parts['host'] ) ? (string) $parts['host'] : '';
	}

	/**
	 * Returns the canonical URL for an object.
	 *
	 * @param string $key Object key.
	 *
	 * @return string
	 */
	public function build_object_url( string $key ): string {
		$key = ltrim( $key, '/' );
		if ( $this->path_style ) {
			return $this->endpoint . '/' . $this->bucket . '/' . $key;
		}

		$parts = wp_parse_url( $this->endpoint );
		if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
			return $this->endpoint . '/' . $this->bucket . '/' . $key;
		}

		return $parts['scheme'] . '://' . $this->bucket . '.' . $parts['host'] . '/' . $key;
	}

	/**
	 * Returns the public URL for an object, preferring the CDN base if set.
	 *
	 * @param string $key Object key.
	 *
	 * @return string
	 */
	public function build_public_url( string $key ): string {
		if ( '' !== $this->public_base_url ) {
			return $this->public_base_url . '/' . ltrim( $key, '/' );
		}
		return $this->build_object_url( $key );
	}
}
