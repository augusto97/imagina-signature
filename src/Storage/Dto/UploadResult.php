<?php
/**
 * Result returned by drivers after a server-side upload.
 *
 * @package ImaginaSignatures\Storage\Dto
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Dto;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Immutable upload result DTO.
 *
 * @since 1.0.0
 */
final class UploadResult {

	public string $storage_key;
	public string $public_url;
	public int $size_bytes;
	public string $mime_type;
	public ?int $width;
	public ?int $height;
	public ?string $hash_sha256;
	public ?int $attachment_id;

	/**
	 * Constructor.
	 *
	 * @param string  $storage_key   Driver-relative key.
	 * @param string  $public_url    Publicly accessible URL.
	 * @param int     $size_bytes    File size in bytes.
	 * @param string  $mime_type     Detected MIME type.
	 * @param ?int    $width         Image width, if applicable.
	 * @param ?int    $height        Image height, if applicable.
	 * @param ?string $hash_sha256   SHA-256 hash, if computed.
	 * @param ?int    $attachment_id WP attachment ID, when stored in Media Library.
	 */
	public function __construct(
		string $storage_key,
		string $public_url,
		int $size_bytes,
		string $mime_type,
		?int $width = null,
		?int $height = null,
		?string $hash_sha256 = null,
		?int $attachment_id = null
	) {
		$this->storage_key   = $storage_key;
		$this->public_url    = $public_url;
		$this->size_bytes    = $size_bytes;
		$this->mime_type     = $mime_type;
		$this->width         = $width;
		$this->height        = $height;
		$this->hash_sha256   = $hash_sha256;
		$this->attachment_id = $attachment_id;
	}

	/**
	 * Serializes to an array suitable for JSON or DB persistence.
	 *
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'storage_key'   => $this->storage_key,
			'public_url'    => $this->public_url,
			'size_bytes'    => $this->size_bytes,
			'mime_type'     => $this->mime_type,
			'width'         => $this->width,
			'height'        => $this->height,
			'hash_sha256'   => $this->hash_sha256,
			'attachment_id' => $this->attachment_id,
		];
	}
}
