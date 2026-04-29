<?php
/**
 * Asset model.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

defined( 'ABSPATH' ) || exit;

/**
 * One row of `imgsig_assets` (CLAUDE.md §7.1).
 *
 * An asset is a user-uploaded file (image, primarily) tracked
 * independently of the storage backend that holds the bytes.
 * `storage_driver` + `storage_key` are enough to retrieve the file
 * via {@see \ImaginaSignatures\Storage\StorageManager}.
 *
 * @since 1.0.0
 */
final class Asset extends BaseModel {

	/**
	 * Owner user ID.
	 *
	 * @var int
	 */
	public int $user_id = 0;

	/**
	 * Backend that stored the bytes (`media_library` / `s3`).
	 *
	 * @var string
	 */
	public string $storage_driver = '';

	/**
	 * Backend-specific key (attachment ID for Media Library, object key
	 * for S3).
	 *
	 * @var string
	 */
	public string $storage_key = '';

	/**
	 * Public URL for fetching the file.
	 *
	 * @var string
	 */
	public string $public_url = '';

	/**
	 * IANA mime type.
	 *
	 * @var string
	 */
	public string $mime_type = '';

	/**
	 * File size in bytes.
	 *
	 * @var int
	 */
	public int $size_bytes = 0;

	/**
	 * Image width, or null for non-image content.
	 *
	 * @var int|null
	 */
	public ?int $width = null;

	/**
	 * Image height, or null for non-image content.
	 *
	 * @var int|null
	 */
	public ?int $height = null;

	/**
	 * SHA-256 of the file contents (hex).
	 *
	 * @var string
	 */
	public string $hash_sha256 = '';

	/**
	 * Hydrates from a DB row.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $row DB row.
	 *
	 * @return self
	 */
	public static function from_row( array $row ): self {
		$model                 = new self();
		$model->id             = isset( $row['id'] ) ? (int) $row['id'] : 0;
		$model->user_id        = isset( $row['user_id'] ) ? (int) $row['user_id'] : 0;
		$model->storage_driver = isset( $row['storage_driver'] ) ? (string) $row['storage_driver'] : '';
		$model->storage_key    = isset( $row['storage_key'] ) ? (string) $row['storage_key'] : '';
		$model->public_url     = isset( $row['public_url'] ) ? (string) $row['public_url'] : '';
		$model->mime_type      = isset( $row['mime_type'] ) ? (string) $row['mime_type'] : '';
		$model->size_bytes     = isset( $row['size_bytes'] ) ? (int) $row['size_bytes'] : 0;
		$model->width          = isset( $row['width'] ) && null !== $row['width'] ? (int) $row['width'] : null;
		$model->height         = isset( $row['height'] ) && null !== $row['height'] ? (int) $row['height'] : null;
		$model->hash_sha256    = isset( $row['hash_sha256'] ) ? (string) $row['hash_sha256'] : '';
		$model->created_at     = isset( $row['created_at'] ) ? (string) $row['created_at'] : '';
		return $model;
	}

	/**
	 * @inheritDoc
	 */
	public function to_array(): array {
		return [
			'id'             => $this->id,
			'user_id'        => $this->user_id,
			'storage_driver' => $this->storage_driver,
			'storage_key'    => $this->storage_key,
			'public_url'     => $this->public_url,
			'mime_type'      => $this->mime_type,
			'size_bytes'     => $this->size_bytes,
			'width'          => $this->width,
			'height'         => $this->height,
			'hash_sha256'    => $this->hash_sha256,
			'created_at'     => $this->created_at,
		];
	}
}
