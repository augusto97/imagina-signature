<?php
/**
 * Asset model (uploaded image stored via a driver).
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Asset extends BaseModel {

	public int $id;
	public int $user_id;
	public string $storage_driver;
	public string $storage_key;
	public string $public_url;
	public string $mime_type;
	public int $size_bytes;
	public ?int $width;
	public ?int $height;
	public string $hash_sha256;
	public string $created_at;

	public function __construct(
		int $id,
		int $user_id,
		string $storage_driver,
		string $storage_key,
		string $public_url,
		string $mime_type,
		int $size_bytes,
		?int $width,
		?int $height,
		string $hash_sha256,
		string $created_at
	) {
		$this->id             = $id;
		$this->user_id        = $user_id;
		$this->storage_driver = $storage_driver;
		$this->storage_key    = $storage_key;
		$this->public_url     = $public_url;
		$this->mime_type      = $mime_type;
		$this->size_bytes     = $size_bytes;
		$this->width          = $width;
		$this->height         = $height;
		$this->hash_sha256    = $hash_sha256;
		$this->created_at     = $created_at;
	}

	/**
	 * @return array<string, mixed>
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

	/**
	 * @param array<string, mixed> $row Row.
	 */
	public static function from_row( array $row ): self {
		return new self(
			(int) ( $row['id'] ?? 0 ),
			(int) ( $row['user_id'] ?? 0 ),
			(string) ( $row['storage_driver'] ?? '' ),
			(string) ( $row['storage_key'] ?? '' ),
			(string) ( $row['public_url'] ?? '' ),
			(string) ( $row['mime_type'] ?? '' ),
			(int) ( $row['size_bytes'] ?? 0 ),
			isset( $row['width'] ) && null !== $row['width'] ? (int) $row['width'] : null,
			isset( $row['height'] ) && null !== $row['height'] ? (int) $row['height'] : null,
			(string) ( $row['hash_sha256'] ?? '' ),
			(string) ( $row['created_at'] ?? '' )
		);
	}
}
