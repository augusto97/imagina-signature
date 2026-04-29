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
use ImaginaSignatures\Storage\S3\PresignedUrl;
use ImaginaSignatures\Storage\S3\ProviderPresets;
use ImaginaSignatures\Storage\S3\S3Client;
use ImaginaSignatures\Storage\S3\SigV4Signer;

defined( 'ABSPATH' ) || exit;

/**
 * Stores assets in any S3-compatible backend.
 *
 * Backed by {@see SigV4Signer}, {@see S3Client}, and {@see PresignedUrl}
 * from `Storage\S3\`. The driver is a thin orchestrator: each method
 * delegates to the appropriate primitive and translates the result into
 * the {@see StorageDriverInterface} contract.
 *
 * Supports browser-direct uploads via presigned PUT URLs. The
 * {@see upload()} server-side path is kept for fallback and parity.
 *
 * Configuration shape (after decryption — see {@see Encryption}):
 * ```
 *   [
 *     'provider'        => 'cloudflare_r2',  // ProviderPresets ID
 *     'bucket'          => 'my-bucket',
 *     'region'          => 'auto',
 *     'access_key'      => '...',
 *     'secret_key'      => '...',
 *     'account_id'      => '...',           // R2 only
 *     'custom_endpoint' => 'https://...',   // custom only
 *     'public_url_base' => 'https://cdn.example.com',  // optional CDN prefix
 *   ]
 * ```
 *
 * @since 1.0.0
 */
final class S3Driver implements StorageDriverInterface {

	/**
	 * Driver identifier persisted on `imgsig_assets.storage_driver`.
	 */
	public const ID = 's3';

	/**
	 * Required configuration keys.
	 *
	 * @var string[]
	 */
	private const REQUIRED_FIELDS = [ 'provider', 'bucket', 'access_key', 'secret_key' ];

	/**
	 * @var array<string, mixed>
	 */
	private array $config;

	/**
	 * @var SigV4Signer
	 */
	private SigV4Signer $signer;

	/**
	 * @var S3Client
	 */
	private S3Client $client;

	/**
	 * @var PresignedUrl
	 */
	private PresignedUrl $presigner;

	/**
	 * Resolved endpoint URL (no trailing slash).
	 *
	 * @var string
	 */
	private string $endpoint;

	/**
	 * Public URL prefix (CDN or path-style endpoint), no trailing slash.
	 *
	 * @var string
	 */
	private string $public_url_base;

	/**
	 * @param array<string, mixed> $config    Decrypted storage configuration.
	 * @param SigV4Signer          $signer    Configured signer.
	 * @param S3Client             $client    Configured HTTP client.
	 * @param PresignedUrl         $presigner Configured presigned-URL builder.
	 */
	public function __construct(
		array $config,
		SigV4Signer $signer,
		S3Client $client,
		PresignedUrl $presigner
	) {
		$this->config    = $config;
		$this->signer    = $signer;
		$this->client    = $client;
		$this->presigner = $presigner;

		$preset_id    = (string) ( $config['provider'] ?? '' );
		$region       = (string) ( $config['region'] ?? '' );
		$extra_fields = [];
		foreach ( [ 'account_id', 'custom_endpoint' ] as $field ) {
			if ( isset( $config[ $field ] ) ) {
				$extra_fields[ $field ] = (string) $config[ $field ];
			}
		}
		$this->endpoint = rtrim(
			ProviderPresets::resolve_endpoint( $preset_id, $region, $extra_fields ),
			'/'
		);

		$base = isset( $config['public_url_base'] ) ? (string) $config['public_url_base'] : '';
		$this->public_url_base = '' !== $base
			? rtrim( $base, '/' )
			: $this->endpoint . '/' . rawurlencode( (string) ( $config['bucket'] ?? '' ) );
	}

	/**
	 * Builds an S3Driver from a decrypted config map.
	 *
	 * Validates that the required fields are present and instantiates
	 * the supporting primitives. Throws when the config is incomplete.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $config Decrypted storage configuration.
	 *
	 * @return self
	 *
	 * @throws StorageException When required fields are missing or
	 *                          the provider preset is unknown.
	 */
	public static function from_config( array $config ): self {
		foreach ( self::REQUIRED_FIELDS as $field ) {
			if ( empty( $config[ $field ] ) ) {
				throw new StorageException( sprintf( 'S3 storage configuration is missing required field "%s".', $field ) );
			}
		}

		$preset_id = (string) $config['provider'];
		if ( ! ProviderPresets::exists( $preset_id ) ) {
			throw new StorageException( sprintf( 'Unknown S3 provider preset "%s".', $preset_id ) );
		}

		// R2 has a fixed region; otherwise the user must supply it
		// (custom presets without {region} in the template are fine).
		$fixed_region = ProviderPresets::fixed_region( $preset_id );
		$region       = $fixed_region ?? (string) ( $config['region'] ?? '' );

		if ( '' === $region && 'custom' !== $preset_id ) {
			throw new StorageException( 'A region must be configured for this provider.' );
		}

		// `custom` falls back to a sentinel region when none is set.
		if ( '' === $region ) {
			$region = 'us-east-1';
		}

		$extra_fields = [];
		foreach ( [ 'account_id', 'custom_endpoint' ] as $field ) {
			if ( isset( $config[ $field ] ) ) {
				$extra_fields[ $field ] = (string) $config[ $field ];
			}
		}
		$endpoint = ProviderPresets::resolve_endpoint( $preset_id, $region, $extra_fields );

		if ( '' === $endpoint ) {
			throw new StorageException( 'Could not resolve a usable endpoint URL for this provider.' );
		}

		$signer    = new SigV4Signer( (string) $config['access_key'], (string) $config['secret_key'], $region );
		$bucket    = (string) $config['bucket'];
		$client    = new S3Client( $signer, $endpoint, $bucket );
		$presigner = new PresignedUrl( $signer, $endpoint, $bucket );

		// Stash the resolved region back into the config so consumers
		// of $config (e.g. the settings page rendering the active state)
		// see the effective values.
		$config['region'] = $region;

		return new self( $config, $signer, $client, $presigner );
	}

	/**
	 * @inheritDoc
	 */
	public function get_id(): string {
		return self::ID;
	}

	/**
	 * @inheritDoc
	 */
	public function supports_presigned_uploads(): bool {
		return true;
	}

	/**
	 * @inheritDoc
	 */
	public function is_configured(): bool {
		foreach ( self::REQUIRED_FIELDS as $field ) {
			if ( empty( $this->config[ $field ] ) ) {
				return false;
			}
		}
		return '' !== $this->endpoint;
	}

	/**
	 * @inheritDoc
	 *
	 * Server-side upload — reads the file into memory and PUTs it. Kept
	 * for parity with {@see MediaLibraryDriver}; in practice the editor
	 * uses {@see get_presigned_upload_url()} so the file never touches PHP.
	 */
	public function upload( string $source_path, string $destination_key, array $meta ): UploadResult {
		if ( '' === $source_path || ! file_exists( $source_path ) ) {
			throw new StorageException( 'Source file does not exist.' );
		}

		$body = file_get_contents( $source_path );
		if ( false === $body ) {
			throw new StorageException( 'Unable to read source file.' );
		}

		$content_type = isset( $meta['mime_type'] ) ? (string) $meta['mime_type'] : 'application/octet-stream';

		$response = $this->client->put_object( $destination_key, $body, $content_type );

		if ( $response['code'] < 200 || $response['code'] >= 300 ) {
			throw new StorageException(
				sprintf( 'S3 PUT returned HTTP %d: %s', $response['code'], $response['body'] )
			);
		}

		return new UploadResult(
			$destination_key,
			$this->get_public_url( $destination_key ),
			(int) strlen( $body ),
			$content_type,
			hash( 'sha256', $body ),
			self::ID,
			isset( $meta['width'] ) ? (int) $meta['width'] : null,
			isset( $meta['height'] ) ? (int) $meta['height'] : null
		);
	}

	/**
	 * @inheritDoc
	 */
	public function get_presigned_upload_url(
		string $key,
		string $content_type,
		int $max_size,
		int $expires_seconds
	): PresignedResult {
		if ( ! $this->is_configured() ) {
			throw new StorageException( 'S3 driver is not configured.' );
		}

		$url        = $this->presigner->for_put( $key, $content_type, $expires_seconds );
		$expires_at = time() + $expires_seconds;

		return new PresignedResult(
			$url,
			'PUT',
			[ 'Content-Type' => $content_type ],
			$key,
			$expires_at,
			$max_size,
			$this->get_public_url( $key )
		);
	}

	/**
	 * @inheritDoc
	 *
	 * Composes `<public_url_base>/<key>`, where `public_url_base` is
	 * either the configured CDN prefix (when present) or the resolved
	 * endpoint + bucket. The key is URL-encoded segment-by-segment so
	 * `/` separators are preserved.
	 */
	public function get_public_url( string $key ): string {
		if ( '' === $key ) {
			return '';
		}

		$encoded_key = implode(
			'/',
			array_map(
				static function ( string $segment ): string {
					return rawurlencode( rawurldecode( $segment ) );
				},
				explode( '/', ltrim( $key, '/' ) )
			)
		);

		return $this->public_url_base . '/' . $encoded_key;
	}

	/**
	 * @inheritDoc
	 *
	 * Idempotent: 404 from the backend counts as success because the
	 * object is gone (or never existed).
	 */
	public function delete( string $key ): bool {
		if ( '' === $key ) {
			return true;
		}

		$response = $this->client->delete_object( $key );
		return ( $response['code'] >= 200 && $response['code'] < 300 ) || 404 === $response['code'];
	}

	/**
	 * @inheritDoc
	 *
	 * Issues a HEAD against the configured bucket. Translates HTTP
	 * status codes into actionable user-facing messages without
	 * leaking provider-internal details.
	 */
	public function test_connection(): TestResult {
		if ( ! $this->is_configured() ) {
			return TestResult::failure(
				__( 'S3 driver is not fully configured.', 'imagina-signatures' ),
				[ 'reason' => 'missing_config' ]
			);
		}

		try {
			$response = $this->client->head_bucket();
		} catch ( StorageException $e ) {
			return TestResult::failure(
				__( 'Could not reach the storage endpoint.', 'imagina-signatures' ),
				[ 'reason' => 'transport', 'detail' => $e->getMessage() ]
			);
		}

		$code = (int) $response['code'];

		if ( $code >= 200 && $code < 300 ) {
			return TestResult::success(
				__( 'Connection succeeded — bucket is reachable and credentials are valid.', 'imagina-signatures' ),
				[ 'http_code' => $code, 'endpoint' => $this->endpoint ]
			);
		}

		if ( 403 === $code || 401 === $code ) {
			return TestResult::failure(
				__( 'The endpoint rejected the credentials.', 'imagina-signatures' ),
				[ 'reason' => 'forbidden', 'http_code' => $code ]
			);
		}

		if ( 404 === $code ) {
			return TestResult::failure(
				__( 'The configured bucket was not found at this endpoint.', 'imagina-signatures' ),
				[ 'reason' => 'not_found', 'http_code' => $code ]
			);
		}

		return TestResult::failure(
			sprintf(
				/* translators: %d: HTTP status code returned by the storage endpoint. */
				__( 'Storage endpoint returned an unexpected HTTP %d response.', 'imagina-signatures' ),
				$code
			),
			[ 'reason' => 'unexpected_http', 'http_code' => $code ]
		);
	}
}
