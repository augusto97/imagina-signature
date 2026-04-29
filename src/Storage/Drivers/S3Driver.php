<?php
/**
 * S3-compatible storage driver.
 *
 * @package ImaginaSignatures\Storage\Drivers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Drivers;

use ImaginaSignatures\Exceptions\StorageException;
use ImaginaSignatures\Storage\Contracts\StorageDriverInterface;
use ImaginaSignatures\Storage\Dto\PresignedResult;
use ImaginaSignatures\Storage\Dto\TestResult;
use ImaginaSignatures\Storage\Dto\UploadResult;
use ImaginaSignatures\Storage\S3\BucketConfig;
use ImaginaSignatures\Storage\S3\SigV4Signer;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * S3-compatible driver leveraging SigV4 presigned URLs.
 *
 * The driver supports both presigned uploads (preferred — the browser PUTs
 * directly to the bucket) and server-side uploads via `wp_remote_request`
 * for the rare hosts that block outbound CORS.
 *
 * @since 1.0.0
 */
final class S3Driver implements StorageDriverInterface {

	private BucketConfig $config;
	private SigV4Signer $signer;

	/**
	 * @param BucketConfig $config Bucket connection.
	 */
	public function __construct( BucketConfig $config ) {
		$this->config = $config;
		$this->signer = new SigV4Signer( $config->access_key, $config->secret_key, $config->region );
	}

	/**
	 * {@inheritDoc}
	 */
	public function supports_presigned_uploads(): bool {
		return true;
	}

	/**
	 * {@inheritDoc}
	 */
	public function upload( string $source_path, string $destination_key, array $meta ): UploadResult {
		if ( ! is_file( $source_path ) || ! is_readable( $source_path ) ) {
			throw new StorageException( 'Source file is missing or unreadable.' );
		}

		$payload = (string) file_get_contents( $source_path );
		$mime    = isset( $meta['mime_type'] ) ? (string) $meta['mime_type'] : 'application/octet-stream';

		[ $host, $canonical_uri ] = $this->host_and_uri_for( $destination_key );

		$headers = $this->signer->sign_request(
			'PUT',
			$host,
			$canonical_uri,
			$payload,
			[ 'content-type' => $mime ]
		);

		$response = wp_remote_request(
			'https://' . $host . $canonical_uri,
			[
				'method'  => 'PUT',
				'headers' => $headers,
				'body'    => $payload,
				'timeout' => 30,
			]
		);

		if ( is_wp_error( $response ) ) {
			throw new StorageException( $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			throw new StorageException(
				sprintf( 'S3 upload failed with status %d.', $code )
			);
		}

		return new UploadResult(
			$destination_key,
			$this->config->build_public_url( $destination_key ),
			(int) filesize( $source_path ),
			$mime,
			isset( $meta['width'] ) ? (int) $meta['width'] : null,
			isset( $meta['height'] ) ? (int) $meta['height'] : null,
			is_callable( 'hash_file' ) ? (string) hash_file( 'sha256', $source_path ) : null
		);
	}

	/**
	 * {@inheritDoc}
	 */
	public function get_presigned_upload_url(
		string $key,
		string $content_type,
		int $max_size,
		int $expires_seconds
	): PresignedResult {
		[ $host, $canonical_uri ] = $this->host_and_uri_for( $key );

		$url = $this->signer->presign(
			'PUT',
			$host,
			$canonical_uri,
			$expires_seconds
		);

		return new PresignedResult(
			$url,
			$this->config->build_public_url( $key ),
			$key,
			'PUT',
			[ 'Content-Type' => $content_type ],
			time() + $expires_seconds
		);
	}

	/**
	 * {@inheritDoc}
	 */
	public function get_public_url( string $key ): string {
		return $this->config->build_public_url( $key );
	}

	/**
	 * {@inheritDoc}
	 */
	public function delete( string $key ): bool {
		[ $host, $canonical_uri ] = $this->host_and_uri_for( $key );
		$headers                  = $this->signer->sign_request( 'DELETE', $host, $canonical_uri, '' );

		$response = wp_remote_request(
			'https://' . $host . $canonical_uri,
			[
				'method'  => 'DELETE',
				'headers' => $headers,
				'timeout' => 15,
			]
		);

		if ( is_wp_error( $response ) ) {
			return false;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		return $code >= 200 && $code < 300;
	}

	/**
	 * {@inheritDoc}
	 */
	public function test_connection(): TestResult {
		if ( ! $this->is_configured() ) {
			return new TestResult( false, __( 'Bucket configuration is incomplete.', 'imagina-signatures' ) );
		}

		[ $host, $canonical_uri ] = $this->host_and_uri_for( '' );
		$headers                  = $this->signer->sign_request( 'GET', $host, $canonical_uri, '' );

		$response = wp_remote_request(
			'https://' . $host . $canonical_uri . '?max-keys=0',
			[
				'method'  => 'GET',
				'headers' => $headers,
				'timeout' => 10,
			]
		);

		if ( is_wp_error( $response ) ) {
			return new TestResult( false, $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code >= 200 && $code < 300 ) {
			return new TestResult( true, __( 'Bucket reachable and credentials valid.', 'imagina-signatures' ) );
		}

		return new TestResult(
			false,
			sprintf(
				/* translators: %d: HTTP status code. */
				__( 'Bucket returned HTTP %d.', 'imagina-signatures' ),
				$code
			)
		);
	}

	/**
	 * {@inheritDoc}
	 */
	public function get_id(): string {
		return 's3';
	}

	/**
	 * {@inheritDoc}
	 */
	public function is_configured(): bool {
		return '' !== $this->config->endpoint
			&& '' !== $this->config->bucket
			&& '' !== $this->config->access_key
			&& '' !== $this->config->secret_key;
	}

	/**
	 * Computes the host and URI to address an object.
	 *
	 * @param string $key Object key (may be empty for bucket-level requests).
	 *
	 * @return array{0: string, 1: string}
	 */
	private function host_and_uri_for( string $key ): array {
		$endpoint_host = $this->config->get_host();
		if ( '' === $endpoint_host ) {
			throw new StorageException( 'Invalid endpoint URL.' );
		}

		if ( $this->config->path_style ) {
			$uri = '/' . $this->config->bucket;
			if ( '' !== $key ) {
				$uri .= '/' . $this->encode_key( $key );
			}
			return [ $endpoint_host, $uri ];
		}

		$host = $this->config->bucket . '.' . $endpoint_host;
		$uri  = '/' . ( '' === $key ? '' : $this->encode_key( $key ) );
		return [ $host, $uri ];
	}

	/**
	 * URL-encodes each segment of the key while preserving slashes.
	 *
	 * @param string $key Object key.
	 *
	 * @return string
	 */
	private function encode_key( string $key ): string {
		$segments = explode( '/', ltrim( $key, '/' ) );
		return implode( '/', array_map( 'rawurlencode', $segments ) );
	}
}
