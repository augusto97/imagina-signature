<?php
/**
 * Media Library storage driver.
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

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Stores assets inside `wp-content/uploads/imagina-signatures/`.
 *
 * Files are placed under a per-user subdirectory. The driver does NOT register
 * WP attachments by default (signatures don't need them), but exposes the
 * file via the standard uploads URL so it works with any host that serves
 * uploads publicly.
 *
 * @since 1.0.0
 */
final class MediaLibraryDriver implements StorageDriverInterface {

	private const SUBDIR = 'imagina-signatures';

	/**
	 * {@inheritDoc}
	 */
	public function supports_presigned_uploads(): bool {
		return false;
	}

	/**
	 * {@inheritDoc}
	 */
	public function upload( string $source_path, string $destination_key, array $meta ): UploadResult {
		if ( ! is_file( $source_path ) || ! is_readable( $source_path ) ) {
			throw new StorageException( 'Source file is missing or unreadable.' );
		}

		$dirs = wp_upload_dir();
		if ( ! empty( $dirs['error'] ) ) {
			throw new StorageException( (string) $dirs['error'] );
		}

		$base_dir   = trailingslashit( $dirs['basedir'] ) . self::SUBDIR;
		$dest_path  = trailingslashit( $base_dir ) . $destination_key;
		$dest_dir   = dirname( $dest_path );

		if ( ! wp_mkdir_p( $dest_dir ) ) {
			throw new StorageException( 'Could not create destination directory.' );
		}

		if ( ! @copy( $source_path, $dest_path ) ) {
			throw new StorageException( 'Could not copy file to uploads directory.' );
		}

		$size = (int) filesize( $dest_path );
		$mime = isset( $meta['mime_type'] ) ? (string) $meta['mime_type'] : 'application/octet-stream';
		$hash = is_callable( 'hash_file' ) ? (string) hash_file( 'sha256', $dest_path ) : null;

		$width  = isset( $meta['width'] ) ? (int) $meta['width'] : null;
		$height = isset( $meta['height'] ) ? (int) $meta['height'] : null;
		if ( ( null === $width || null === $height ) && function_exists( 'getimagesize' ) ) {
			$info = @getimagesize( $dest_path );
			if ( is_array( $info ) ) {
				$width  = $width ?? (int) $info[0];
				$height = $height ?? (int) $info[1];
			}
		}

		return new UploadResult(
			$destination_key,
			$this->get_public_url( $destination_key ),
			$size,
			$mime,
			$width,
			$height,
			$hash
		);
	}

	/**
	 * {@inheritDoc}
	 */
	public function get_presigned_upload_url(
		string $key,
		string $content_type,
		int $max_size,
		int $expires_seconds
	): PresignedResult {
		throw new \LogicException( 'Media Library driver does not support presigned uploads.' );
	}

	/**
	 * {@inheritDoc}
	 */
	public function get_public_url( string $key ): string {
		$dirs = wp_upload_dir();
		return trailingslashit( $dirs['baseurl'] ) . self::SUBDIR . '/' . ltrim( $key, '/' );
	}

	/**
	 * {@inheritDoc}
	 */
	public function delete( string $key ): bool {
		$dirs = wp_upload_dir();
		$path = trailingslashit( $dirs['basedir'] ) . self::SUBDIR . '/' . ltrim( $key, '/' );
		if ( ! file_exists( $path ) ) {
			return true;
		}
		return (bool) @unlink( $path );
	}

	/**
	 * {@inheritDoc}
	 */
	public function test_connection(): TestResult {
		$dirs = wp_upload_dir();
		if ( ! empty( $dirs['error'] ) ) {
			return new TestResult( false, (string) $dirs['error'] );
		}

		$dir = trailingslashit( $dirs['basedir'] ) . self::SUBDIR;
		if ( ! file_exists( $dir ) ) {
			wp_mkdir_p( $dir );
		}

		$writable = is_writable( $dir );
		return new TestResult(
			$writable,
			$writable
				? __( 'Uploads directory is writable.', 'imagina-signatures' )
				: __( 'Uploads directory is not writable.', 'imagina-signatures' ),
			[ 'path' => $dir ]
		);
	}

	/**
	 * {@inheritDoc}
	 */
	public function get_id(): string {
		return 'media_library';
	}

	/**
	 * {@inheritDoc}
	 */
	public function is_configured(): bool {
		return true;
	}
}
