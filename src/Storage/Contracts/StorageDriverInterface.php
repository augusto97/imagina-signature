<?php
/**
 * Contract every storage driver must implement.
 *
 * @package ImaginaSignatures\Storage\Contracts
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Contracts;

use ImaginaSignatures\Storage\Dto\PresignedResult;
use ImaginaSignatures\Storage\Dto\TestResult;
use ImaginaSignatures\Storage\Dto\UploadResult;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Storage driver contract.
 *
 * Drivers fall into two categories: those that accept server-side uploads
 * (Media Library) and those that issue presigned URLs so the browser can
 * upload directly (S3-compatible). Methods that don't apply to a given
 * driver may throw `LogicException`.
 *
 * @since 1.0.0
 */
interface StorageDriverInterface {

	/**
	 * Whether the driver supports browser→storage presigned uploads.
	 *
	 * @return bool
	 */
	public function supports_presigned_uploads(): bool;

	/**
	 * Performs a server-side upload from a local path.
	 *
	 * @param string               $source_path     Absolute path to source file.
	 * @param string               $destination_key Driver-relative key.
	 * @param array<string, mixed> $meta            Extra metadata (mime, size, …).
	 *
	 * @return UploadResult
	 */
	public function upload( string $source_path, string $destination_key, array $meta ): UploadResult;

	/**
	 * Issues a presigned upload URL.
	 *
	 * @param string $key             Object key.
	 * @param string $content_type    Expected Content-Type header.
	 * @param int    $max_size        Maximum allowed body size, in bytes.
	 * @param int    $expires_seconds Expiration window for the URL.
	 *
	 * @return PresignedResult
	 */
	public function get_presigned_upload_url(
		string $key,
		string $content_type,
		int $max_size,
		int $expires_seconds
	): PresignedResult;

	/**
	 * Returns the public URL for an object.
	 *
	 * @param string $key Object key.
	 *
	 * @return string
	 */
	public function get_public_url( string $key ): string;

	/**
	 * Deletes an object. Returns true if the object no longer exists.
	 *
	 * @param string $key Object key.
	 *
	 * @return bool
	 */
	public function delete( string $key ): bool;

	/**
	 * Validates the current configuration.
	 *
	 * @return TestResult
	 */
	public function test_connection(): TestResult;

	/**
	 * Driver identifier (e.g. `media_library`, `s3`).
	 *
	 * @return string
	 */
	public function get_id(): string;

	/**
	 * Whether the driver is fully configured and ready to use.
	 *
	 * @return bool
	 */
	public function is_configured(): bool;
}
