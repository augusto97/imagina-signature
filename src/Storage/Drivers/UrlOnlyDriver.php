<?php
/**
 * URL-only storage driver — refuses every upload.
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

defined( 'ABSPATH' ) || exit;

/**
 * Storage backend for sites that don't want the plugin to host any
 * files at all. Every upload method throws `StorageException`. The
 * editor reads `uploadEnabled = false` from the bootstrap config and
 * hides the file-picker / cropper UI; users paste an external URL
 * for any image / banner / avatar instead.
 *
 * Use cases:
 *  - Compliance: GDPR-conscious admins who want zero recipient-
 *    facing assets stored on the WP host.
 *  - Cost: avoiding `wp-content/uploads` bloat when signatures are
 *    just thin wrappers around already-hosted brand imagery.
 *  - Existing CDN: the org already has a CDN (Cloudflare Images,
 *    Cloudinary, etc.) and prefers users paste those URLs directly.
 *
 * No configuration is required. The driver advertises itself as
 * "configured" so the manager doesn't refuse to instantiate it, and
 * `test_connection()` always passes.
 *
 * @since 1.0.29
 */
final class UrlOnlyDriver implements StorageDriverInterface {

	/**
	 * Driver identifier — used in the admin Settings page and the
	 * `imgsig_storage_driver` option.
	 */
	public const ID = 'url_only';

	/**
	 * @inheritDoc
	 */
	public function supports_presigned_uploads(): bool {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * @throws StorageException Always.
	 */
	public function upload( string $source_path, string $destination_key, array $meta ): UploadResult {
		throw new StorageException(
			__(
				'Uploads are disabled in URL-only mode. Paste an external image URL instead.',
				'imagina-signatures'
			)
		);
	}

	/**
	 * @inheritDoc
	 *
	 * @throws StorageException Always.
	 */
	public function get_presigned_upload_url( string $key, string $content_type, int $max_size, int $expires_seconds ): PresignedResult {
		throw new StorageException(
			__(
				'Uploads are disabled in URL-only mode. Paste an external image URL instead.',
				'imagina-signatures'
			)
		);
	}

	/**
	 * @inheritDoc
	 */
	public function get_public_url( string $key ): string {
		// `$key` is meaningless under URL-only because nothing is
		// hosted by the plugin. Returning empty rather than throwing
		// keeps existing assets readable (a row that was uploaded
		// via a previous driver still has its public_url cached on
		// the asset row itself).
		return '';
	}

	/**
	 * @inheritDoc
	 */
	public function delete( string $key ): bool {
		// Nothing to delete — we never stored anything. Returning
		// true so `AssetsController::delete` proceeds to remove the
		// DB row even though no file lookup happened.
		return true;
	}

	/**
	 * @inheritDoc
	 */
	public function test_connection(): TestResult {
		return TestResult::success(
			__( 'URL-only mode active — no storage backend to test.', 'imagina-signatures' )
		);
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
	public function is_configured(): bool {
		// Always considered configured — there's no config to fill.
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * Always false — this driver hosts nothing, so there's never an
	 * object to verify. The upload flow short-circuits at the
	 * `UploadController` (HTTP 403 `imgsig_uploads_disabled`) before
	 * any code path could call this — but the interface still requires
	 * a concrete implementation. Forgetting it in 1.0.29 left the
	 * class abstract-by-inference, which fatal-errored on every page
	 * load (autoloader resolved the class name but PHP refused to
	 * instantiate it).
	 */
	public function verify_object_exists( string $key ): bool {
		return false;
	}
}
