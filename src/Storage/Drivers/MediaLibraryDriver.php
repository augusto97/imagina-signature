<?php
/**
 * Native Media Library storage driver.
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
 * Stores assets inside the WordPress Media Library.
 *
 * Files land in `wp-content/uploads/imagina-signatures/{user_id}/` (CLAUDE.md §17.2).
 * The default driver — zero configuration, no external dependencies, works on any
 * shared host. We wrap `wp_handle_sideload()` plus `wp_insert_attachment()` so each
 * uploaded file becomes a Media Library attachment that the user can also see and
 * manage from the standard `wp-admin/upload.php` screen.
 *
 * The `storage_key` returned from {@see upload()} is the attachment ID stringified.
 * Browser-direct (presigned) uploads are NOT supported — the editor falls back to
 * the multipart `POST /upload/direct` endpoint when this driver is active.
 *
 * @since 1.0.0
 */
final class MediaLibraryDriver implements StorageDriverInterface {

	/**
	 * Driver identifier persisted on `imgsig_assets.storage_driver`.
	 */
	public const ID = 'media_library';

	/**
	 * Subdirectory under `wp-content/uploads/`.
	 */
	private const SUBDIR = 'imagina-signatures';

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
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * Media Library has no configuration to fail on; it's always considered configured.
	 */
	public function is_configured(): bool {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * `$destination_key` is treated as a filename hint and sanitised; the
	 * actual storage key returned in {@see UploadResult::$storage_key} is
	 * the resulting attachment ID. `$meta['user_id']` is required so we
	 * can route the file into the user-scoped subdirectory and assign
	 * authorship.
	 *
	 * @param string               $source_path     Absolute path to the source file.
	 * @param string               $destination_key Filename hint (sanitised before use).
	 * @param array<string, mixed> $meta            Must include `user_id` (int).
	 *
	 * @return UploadResult
	 *
	 * @throws StorageException When the source file is missing, `meta[user_id]`
	 *                          is absent, or the WordPress upload pipeline fails.
	 */
	public function upload( string $source_path, string $destination_key, array $meta ): UploadResult {
		if ( ! is_string( $source_path ) || '' === $source_path || ! file_exists( $source_path ) ) {
			throw new StorageException( 'Source file does not exist.' );
		}

		$user_id = isset( $meta['user_id'] ) ? (int) $meta['user_id'] : 0;
		if ( $user_id <= 0 ) {
			throw new StorageException( 'meta[user_id] is required for MediaLibraryDriver uploads.' );
		}

		// Lazy-load WP helpers — these aren't part of the front-end runtime.
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';

		// Redirect uploads to wp-content/uploads/imagina-signatures/{user_id}/.
		$filter = $this->user_subdir_filter( $user_id );
		add_filter( 'upload_dir', $filter );

		try {
			$filename = sanitize_file_name(
				'' !== $destination_key ? $destination_key : basename( $source_path )
			);

			$file_array = [
				'name'     => $filename,
				'tmp_name' => $source_path,
				'type'     => isset( $meta['mime_type'] ) ? (string) $meta['mime_type'] : '',
				'error'    => 0,
				'size'     => (int) filesize( $source_path ),
			];

			$overrides = [
				'test_form' => false, // The file did not come from a $_POST form submission.
				'test_size' => true,
			];

			$sideload = wp_handle_sideload( $file_array, $overrides );

			if ( isset( $sideload['error'] ) ) {
				throw new StorageException(
					'wp_handle_sideload failed: ' . (string) $sideload['error']
				);
			}

			$attachment_id = wp_insert_attachment(
				[
					'post_mime_type' => (string) $sideload['type'],
					'post_title'     => sanitize_text_field(
						pathinfo( (string) $sideload['file'], PATHINFO_FILENAME )
					),
					'post_content'   => '',
					'post_status'    => 'inherit',
					'post_author'    => $user_id,
				],
				(string) $sideload['file'],
				0,
				true
			);

			if ( is_wp_error( $attachment_id ) ) {
				wp_delete_file( (string) $sideload['file'] );
				throw new StorageException(
					'wp_insert_attachment failed: ' . $attachment_id->get_error_message()
				);
			}

			// Best-effort metadata generation: failure here means missing
			// width/height but isn't fatal — the asset is still usable.
			$metadata = wp_generate_attachment_metadata( $attachment_id, (string) $sideload['file'] );
			if ( is_array( $metadata ) ) {
				wp_update_attachment_metadata( $attachment_id, $metadata );
			} else {
				$metadata = [];
			}

			$public_url = wp_get_attachment_url( $attachment_id );
			$size       = (int) filesize( (string) $sideload['file'] );
			$hash       = (string) hash_file( 'sha256', (string) $sideload['file'] );

			return new UploadResult(
				(string) $attachment_id,
				is_string( $public_url ) ? $public_url : '',
				$size,
				(string) $sideload['type'],
				$hash,
				self::ID,
				isset( $metadata['width'] ) ? (int) $metadata['width'] : null,
				isset( $metadata['height'] ) ? (int) $metadata['height'] : null
			);
		} finally {
			remove_filter( 'upload_dir', $filter );
		}
	}

	/**
	 * @inheritDoc
	 *
	 * Media Library doesn't expose a presigned-upload contract. Callers
	 * should check {@see supports_presigned_uploads()} and route through
	 * {@see upload()} when this driver is active.
	 *
	 * @param string $key             Unused.
	 * @param string $content_type    Unused.
	 * @param int    $max_size        Unused.
	 * @param int    $expires_seconds Unused.
	 *
	 * @return PresignedResult Never returns; always throws.
	 *
	 * @throws StorageException Always.
	 */
	public function get_presigned_upload_url(
		string $key,
		string $content_type,
		int $max_size,
		int $expires_seconds
	): PresignedResult {
		unset( $key, $content_type, $max_size, $expires_seconds );
		throw new StorageException( 'MediaLibraryDriver does not support presigned uploads.' );
	}

	/**
	 * @inheritDoc
	 *
	 * @param string $key Attachment ID, stringified.
	 *
	 * @return string
	 */
	public function get_public_url( string $key ): string {
		$attachment_id = (int) $key;
		if ( $attachment_id <= 0 ) {
			return '';
		}

		$url = wp_get_attachment_url( $attachment_id );
		return is_string( $url ) ? $url : '';
	}

	/**
	 * @inheritDoc
	 *
	 * Idempotent: returns true when the attachment never existed in the
	 * first place, since the post-condition (it's gone) is satisfied.
	 *
	 * @param string $key Attachment ID, stringified.
	 */
	public function delete( string $key ): bool {
		$attachment_id = (int) $key;
		if ( $attachment_id <= 0 ) {
			return true;
		}

		$result = wp_delete_attachment( $attachment_id, true );
		return false !== $result && null !== $result;
	}

	/**
	 * @inheritDoc
	 *
	 * Verifies the WordPress uploads directory is reachable and writable,
	 * and that we can create our own subdirectory underneath it.
	 */
	public function test_connection(): TestResult {
		$upload_dir = wp_upload_dir();

		if ( ! empty( $upload_dir['error'] ) ) {
			return TestResult::failure(
				__( 'WordPress reports an error with the uploads directory.', 'imagina-signatures' ),
				[ 'error' => (string) $upload_dir['error'] ]
			);
		}

		$plugin_dir = trailingslashit( (string) $upload_dir['basedir'] ) . self::SUBDIR;

		if ( ! is_dir( $plugin_dir ) && ! wp_mkdir_p( $plugin_dir ) ) {
			return TestResult::failure(
				__( 'Cannot create the imagina-signatures directory under uploads.', 'imagina-signatures' ),
				[ 'path' => $plugin_dir ]
			);
		}

		if ( ! wp_is_writable( $plugin_dir ) ) {
			return TestResult::failure(
				__( 'The imagina-signatures uploads directory is not writable.', 'imagina-signatures' ),
				[ 'path' => $plugin_dir ]
			);
		}

		return TestResult::success(
			__( 'Media Library is reachable and writable.', 'imagina-signatures' ),
			[ 'path' => $plugin_dir ]
		);
	}

	/**
	 * Returns a closure that rewrites `wp_upload_dir()` to land inside the
	 * `imagina-signatures/{user_id}/` subdirectory.
	 *
	 * Stored in a local variable so the same callable can be passed to both
	 * `add_filter()` and `remove_filter()`.
	 *
	 * @since 1.0.0
	 *
	 * @param int $user_id Owner of the upload.
	 *
	 * @return callable
	 */
	private function user_subdir_filter( int $user_id ): callable {
		$subdir = '/' . self::SUBDIR . '/' . $user_id;

		return static function ( array $dirs ) use ( $subdir ): array {
			$dirs['path']   = ( $dirs['basedir'] ?? '' ) . $subdir;
			$dirs['url']    = ( $dirs['baseurl'] ?? '' ) . $subdir;
			$dirs['subdir'] = $subdir;
			return $dirs;
		};
	}
}
