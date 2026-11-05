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
use ImaginaSignatures\Storage\ImageProcessor;
use ImaginaSignatures\Storage\UploadPolicy;

defined( 'ABSPATH' ) || exit;

/**
 * Stores assets inside the WordPress Media Library.
 *
 * Files land in `wp-content/uploads/imagina-signatures/{token}/` where
 * `{token}` is a random per-user directory name (user meta
 * `imgsig_upload_token`) — public URLs expose neither the WordPress
 * user id nor the original filename (files are named after their
 * content hash). The default driver — zero configuration, works on any
 * shared host. We wrap `wp_handle_sideload()` plus
 * `wp_insert_attachment()` so each uploaded file becomes a Media
 * Library attachment (tagged with the `_imgsig_asset` post meta so a
 * data purge can find it).
 *
 * Images are normalised first by {@see ImageProcessor} (EXIF/GPS
 * stripped from JPEGs, anything wider than 1600 px downscaled) and no
 * intermediate image sizes are generated for plugin uploads. vCards
 * (`.vcf`) are accepted only through this plugin's own uploads.
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
	public const SUBDIR = 'imagina-signatures';

	/**
	 * Post meta flag stamped on every attachment this driver creates
	 * (value = owner user id).
	 */
	public const ATTACHMENT_META = '_imgsig_asset';

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
	 * `$destination_key` is only a fallback filename hint: accepted
	 * images and vCards are stored as `{content-hash}.{ext}`. The actual
	 * storage key returned in {@see UploadResult::$storage_key} is the
	 * resulting attachment ID. `$meta['user_id']` is required so we can
	 * route the file into the user's token directory and assign
	 * authorship; `$meta['mime_type']` should be the canonical type the
	 * upload controller validated.
	 *
	 * @param string               $source_path     Absolute path to the source file.
	 * @param string               $destination_key Fallback filename hint (sanitised before use).
	 * @param array<string, mixed> $meta            Must include `user_id` (int); `mime_type` recommended.
	 *
	 * @return UploadResult
	 *
	 * @throws StorageException When the source file is missing, `meta[user_id]`
	 *                          is absent, or the WordPress upload pipeline fails.
	 */
	public function upload( string $source_path, string $destination_key, array $meta ): UploadResult {
		if ( ! is_string( $source_path ) || '' === $source_path || ! file_exists( $source_path ) ) {
			throw new StorageException( __( 'Source file does not exist.', 'imagina-signatures' ) );
		}

		$user_id = isset( $meta['user_id'] ) ? (int) $meta['user_id'] : 0;
		if ( $user_id <= 0 ) {
			throw new StorageException( 'meta[user_id] is required for MediaLibraryDriver uploads.' );
		}

		// Lazy-load WP helpers — these aren't part of the front-end runtime.
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';

		$mime     = UploadPolicy::canonical_mime( isset( $meta['mime_type'] ) ? (string) $meta['mime_type'] : '' );
		$is_vcard = UploadPolicy::VCARD_MIME === $mime;

		if ( $is_vcard ) {
			$head = (string) file_get_contents( $source_path, false, null, 0, 64 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local upload temp file.
			if ( ! UploadPolicy::looks_like_vcard( $head ) ) {
				throw new StorageException( __( 'The uploaded file is not a vCard.', 'imagina-signatures' ) );
			}
		} elseif ( UploadPolicy::is_image( $mime ) ) {
			// Strip EXIF / GPS and downscale before anything is stored.
			$source_path = ( new ImageProcessor() )->prepare( $source_path, $mime );
		}

		if ( '' !== $mime ) {
			$filename = UploadPolicy::hashed_filename( (string) hash_file( 'sha256', $source_path ), $mime );
		} else {
			$filename = sanitize_file_name(
				'' !== $destination_key ? $destination_key : basename( $source_path )
			);
		}

		// Scoped to this upload only: token directory, vCard mime
		// allowance, and no intermediate image sizes / `-scaled` copy.
		$filters = $this->scoped_filters( $user_id, $is_vcard );
		foreach ( $filters as [ $hook, $callback, $args ] ) {
			add_filter( $hook, $callback, 10, $args );
		}

		try {
			$file_array = [
				'name'     => $filename,
				'tmp_name' => $source_path,
				'type'     => $mime,
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
					'post_title'     => $is_vcard
						? __( 'Signature vCard', 'imagina-signatures' )
						: __( 'Signature image', 'imagina-signatures' ),
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

			update_post_meta( $attachment_id, self::ATTACHMENT_META, $user_id );

			// Best-effort metadata generation (images only): failure here
			// means missing width/height but isn't fatal.
			$metadata = [];
			if ( ! $is_vcard ) {
				$generated = wp_generate_attachment_metadata( $attachment_id, (string) $sideload['file'] );
				if ( is_array( $generated ) ) {
					wp_update_attachment_metadata( $attachment_id, $generated );
					$metadata = $generated;
				}
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
			foreach ( $filters as [ $hook, $callback ] ) {
				remove_filter( $hook, $callback, 10 );
			}
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
	 * @inheritDoc
	 *
	 * For Media Library the "key" is an attachment ID. Existence is
	 * cheap to verify — `wp_attachment_url()` returns false when the
	 * attachment doesn't exist.
	 *
	 * @param string $key Attachment ID, stringified.
	 *
	 * @return bool
	 */
	public function verify_object_exists( string $key ): bool {
		$attachment_id = (int) $key;
		if ( $attachment_id <= 0 ) {
			return false;
		}

		$url = wp_get_attachment_url( $attachment_id );
		return is_string( $url ) && '' !== $url;
	}

	/**
	 * Builds the filters that apply to a single plugin upload.
	 *
	 * Returned as `[hook, callback, accepted_args]` triples so the exact
	 * same callables are removed again in `finally`.
	 *
	 * @since 1.0.40
	 *
	 * @param int  $user_id  Owner of the upload.
	 * @param bool $is_vcard Whether the upload is a (pre-validated) vCard.
	 *
	 * @return array<int, array{0: string, 1: callable, 2: int}>
	 */
	private function scoped_filters( int $user_id, bool $is_vcard ): array {
		$filters = [
			[ 'upload_dir', $this->user_subdir_filter( $user_id ), 1 ],
			// Signatures use the original only: no thumbnail / medium /
			// large copies, and no `-scaled` duplicate (WP 5.3+).
			// Closures (not `__return_*` strings) so removing them can't
			// unhook another plugin's identical callback.
			[
				'intermediate_image_sizes_advanced',
				static function (): array {
					return [];
				},
				1,
			],
			[
				'big_image_size_threshold',
				static function (): bool {
					return false;
				},
				1,
			],
		];

		if ( $is_vcard ) {
			$filters[] = [
				'upload_mimes',
				static function ( $mimes ) {
					$mimes        = is_array( $mimes ) ? $mimes : [];
					$mimes['vcf'] = UploadPolicy::VCARD_MIME;
					return $mimes;
				},
				1,
			];
			// fileinfo often reports vCards as text/plain, which core
			// then refuses; the controller + this driver already
			// verified the BEGIN:VCARD signature.
			$filters[] = [
				'wp_check_filetype_and_ext',
				static function ( $data, $file, $filename ) {
					unset( $file );
					if ( 'vcf' === strtolower( pathinfo( (string) $filename, PATHINFO_EXTENSION ) ) ) {
						return [
							'ext'             => 'vcf',
							'type'            => UploadPolicy::VCARD_MIME,
							'proper_filename' => false,
						];
					}
					return $data;
				},
				3,
			];
		}

		return $filters;
	}

	/**
	 * Returns a closure that rewrites `wp_upload_dir()` to land inside the
	 * user's `imagina-signatures/{token}/` subdirectory.
	 *
	 * @since 1.0.0
	 *
	 * @param int $user_id Owner of the upload.
	 *
	 * @return callable
	 */
	private function user_subdir_filter( int $user_id ): callable {
		$subdir = '/' . self::SUBDIR . '/' . UploadPolicy::user_token( $user_id );

		return static function ( array $dirs ) use ( $subdir ): array {
			$dirs['path']   = ( $dirs['basedir'] ?? '' ) . $subdir;
			$dirs['url']    = ( $dirs['baseurl'] ?? '' ) . $subdir;
			$dirs['subdir'] = $subdir;
			return $dirs;
		};
	}
}
