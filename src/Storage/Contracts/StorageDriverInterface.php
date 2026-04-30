<?php
/**
 * Contract for storage drivers.
 *
 * @package ImaginaSignatures\Storage\Contracts
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Contracts;

use ImaginaSignatures\Storage\Dto\PresignedResult;
use ImaginaSignatures\Storage\Dto\TestResult;
use ImaginaSignatures\Storage\Dto\UploadResult;

defined( 'ABSPATH' ) || exit;

/**
 * Pluggable contract for storing user-uploaded assets.
 *
 * The plugin ships with two implementations: a Media Library driver
 * (default, no configuration required) and an S3-compatible driver
 * (R2, Bunny, S3, B2, Spaces, Wasabi, MinIO via endpoint config).
 * `StorageManager` selects one based on `imgsig_storage_driver`.
 *
 * Mirrors CLAUDE.md §17.1.
 *
 * @since 1.0.0
 */
interface StorageDriverInterface {

	/**
	 * Stable identifier for this driver.
	 *
	 * Returned by `StorageManager` and persisted on each `imgsig_assets`
	 * row, so it must NOT change once a driver has written assets to disk.
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	public function get_id(): string;

	/**
	 * Whether this driver supports browser-direct (presigned) uploads.
	 *
	 * Drivers that return `false` must still implement
	 * {@see upload()} for server-side ingestion.
	 *
	 * @since 1.0.0
	 *
	 * @return bool
	 */
	public function supports_presigned_uploads(): bool;

	/**
	 * Whether the driver has all the configuration it needs to operate.
	 *
	 * Media Library is always configured (no settings required); S3
	 * needs a complete credentials/endpoint payload.
	 *
	 * @since 1.0.0
	 *
	 * @return bool
	 */
	public function is_configured(): bool;

	/**
	 * Uploads a file from a local path into the backend.
	 *
	 * @since 1.0.0
	 *
	 * @param string               $source_path     Absolute filesystem path to the source file.
	 * @param string               $destination_key Driver-specific destination key.
	 * @param array<string, mixed> $meta            Extra metadata (mime hint, user_id, etc.).
	 *
	 * @return UploadResult
	 *
	 * @throws \ImaginaSignatures\Exceptions\StorageException On any I/O or backend failure.
	 */
	public function upload( string $source_path, string $destination_key, array $meta ): UploadResult;

	/**
	 * Returns a pre-signed URL the browser can `PUT` directly to.
	 *
	 * Drivers that don't support presigning should throw a
	 * `StorageException` and let callers fall back to {@see upload()}.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key              Destination key (final storage path).
	 * @param string $content_type     MIME type the browser will send.
	 * @param int    $max_size         Maximum allowed bytes.
	 * @param int    $expires_seconds  How long the URL stays valid.
	 *
	 * @return PresignedResult
	 *
	 * @throws \ImaginaSignatures\Exceptions\StorageException On signing or configuration failure.
	 */
	public function get_presigned_upload_url(
		string $key,
		string $content_type,
		int $max_size,
		int $expires_seconds
	): PresignedResult;

	/**
	 * Returns the public URL where the given key is reachable.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Storage key.
	 *
	 * @return string
	 */
	public function get_public_url( string $key ): string;

	/**
	 * Removes an object from the backend.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Storage key.
	 *
	 * @return bool True when deletion succeeded (or the object never existed).
	 *
	 * @throws \ImaginaSignatures\Exceptions\StorageException On a recoverable backend error.
	 */
	public function delete( string $key ): bool;

	/**
	 * Probes the backend to verify configuration and connectivity.
	 *
	 * Must NOT throw — the {@see TestResult} carries success/failure
	 * information so the settings UI can render either path.
	 *
	 * @since 1.0.0
	 *
	 * @return TestResult
	 */
	public function test_connection(): TestResult;

	/**
	 * Confirms that an object already exists at `$key`.
	 *
	 * Called by the upload finalize flow to check that a browser-
	 * direct PUT (presigned) actually landed before the asset row is
	 * inserted into `imgsig_assets`. Drivers that ingest server-side
	 * (e.g. {@see \ImaginaSignatures\Storage\Drivers\MediaLibraryDriver})
	 * may treat this as a no-op since the upload is synchronous and
	 * the row insertion happens in the same call as the write.
	 *
	 * Returns false on any non-2xx / non-3xx HTTP response or
	 * transport failure — never throws so callers have a single
	 * decision point.
	 *
	 * @since 1.0.0
	 *
	 * @param string $key Storage key to probe.
	 *
	 * @return bool True when the object is present.
	 */
	public function verify_object_exists( string $key ): bool;
}
