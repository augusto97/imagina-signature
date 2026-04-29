<?php
/**
 * DTO returned by storage drivers after a successful server-side upload.
 *
 * @package ImaginaSignatures\Storage\Dto
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Dto;

defined( 'ABSPATH' ) || exit;

/**
 * Result of `StorageDriverInterface::upload()`.
 *
 * Field set is intentionally narrow — exactly what the AssetRepository
 * needs to persist a row in `imgsig_assets`. Drivers must populate every
 * non-nullable field. Width/height stay null for non-image content.
 *
 * Public properties mark this as a value object: read it freely, never
 * mutate. PHP 7.4 lacks `readonly`, so the class is `final` so consumers
 * can't subclass it into something mutable.
 *
 * @since 1.0.0
 */
final class UploadResult {

	/**
	 * Driver-specific key for the stored object.
	 *
	 * Media Library: an attachment ID stringified.
	 * S3: the object key (e.g. `signatures/42/avatar.png`).
	 *
	 * @var string
	 */
	public string $storage_key;

	/**
	 * Public URL clients can fetch the asset from.
	 *
	 * @var string
	 */
	public string $public_url;

	/**
	 * Size of the stored object in bytes.
	 *
	 * @var int
	 */
	public int $size_bytes;

	/**
	 * IANA MIME type as detected after upload.
	 *
	 * @var string
	 */
	public string $mime_type;

	/**
	 * SHA-256 of the file contents, hex-encoded.
	 *
	 * Used for client-side dedup and integrity checks.
	 *
	 * @var string
	 */
	public string $hash_sha256;

	/**
	 * Image width in pixels, or null for non-image content.
	 *
	 * @var int|null
	 */
	public ?int $width;

	/**
	 * Image height in pixels, or null for non-image content.
	 *
	 * @var int|null
	 */
	public ?int $height;

	/**
	 * Identifier of the driver that produced this upload.
	 *
	 * Either `media_library` or `s3`.
	 *
	 * @var string
	 */
	public string $driver;

	/**
	 * Constructs a fully populated upload result.
	 *
	 * @since 1.0.0
	 *
	 * @param string   $storage_key Driver-specific key.
	 * @param string   $public_url  Public URL.
	 * @param int      $size_bytes  Size in bytes.
	 * @param string   $mime_type   IANA mime type.
	 * @param string   $hash_sha256 Hex SHA-256.
	 * @param string   $driver      Driver identifier.
	 * @param int|null $width       Image width, or null.
	 * @param int|null $height      Image height, or null.
	 */
	public function __construct(
		string $storage_key,
		string $public_url,
		int $size_bytes,
		string $mime_type,
		string $hash_sha256,
		string $driver,
		?int $width = null,
		?int $height = null
	) {
		$this->storage_key = $storage_key;
		$this->public_url  = $public_url;
		$this->size_bytes  = $size_bytes;
		$this->mime_type   = $mime_type;
		$this->hash_sha256 = $hash_sha256;
		$this->driver      = $driver;
		$this->width       = $width;
		$this->height      = $height;
	}

	/**
	 * Array representation, suitable for JSON responses or DB insertion.
	 *
	 * @since 1.0.0
	 *
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'storage_key' => $this->storage_key,
			'public_url'  => $this->public_url,
			'size_bytes'  => $this->size_bytes,
			'mime_type'   => $this->mime_type,
			'hash_sha256' => $this->hash_sha256,
			'driver'      => $this->driver,
			'width'       => $this->width,
			'height'      => $this->height,
		];
	}
}
