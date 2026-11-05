<?php
/**
 * Server-side record of presigned uploads awaiting finalize.
 *
 * @package ImaginaSignatures\Storage
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage;

defined( 'ABSPATH' ) || exit;

/**
 * Remembers what `/upload/init` authorised for a presigned (S3) upload
 * — owner, canonical mime type, declared byte size — so
 * `/upload/finalize` can verify the stored object against the server's
 * own record instead of trusting what the browser reports afterwards.
 *
 * Stored as a transient keyed by a hash of the object key; it expires
 * shortly after the presigned URL does, so an abandoned upload leaves
 * nothing behind but the (unregistered) object.
 *
 * Not `final` so PHPUnit can double it.
 *
 * @since 1.0.40
 */
class PendingUploads {

	/**
	 * Transient key prefix (swept by the uninstaller's `imgsig_` sweep).
	 */
	private const PREFIX = 'imgsig_pu_';

	/**
	 * Grace period on top of the presigned URL lifetime (seconds) so a
	 * PUT that starts just before expiry can still be finalised.
	 */
	private const GRACE_SECONDS = 900;

	/**
	 * Records an authorised upload.
	 *
	 * @since 1.0.40
	 *
	 * @param string $key         Object key.
	 * @param int    $user_id     Owner.
	 * @param string $mime        Canonical mime type signed into the URL.
	 * @param int    $size_bytes  Declared size.
	 * @param int    $ttl_seconds Presigned URL lifetime.
	 *
	 * @return void
	 */
	public function remember( string $key, int $user_id, string $mime, int $size_bytes, int $ttl_seconds ): void {
		set_transient(
			$this->transient_key( $key ),
			[
				'user_id'    => $user_id,
				'mime_type'  => $mime,
				'size_bytes' => $size_bytes,
				'created_at' => time(),
			],
			$ttl_seconds + self::GRACE_SECONDS
		);
	}

	/**
	 * Returns the record for a key, or null when unknown / expired.
	 *
	 * @since 1.0.40
	 *
	 * @param string $key Object key.
	 *
	 * @return array{user_id: int, mime_type: string, size_bytes: int, created_at: int}|null
	 */
	public function get( string $key ): ?array {
		$record = get_transient( $this->transient_key( $key ) );
		if ( ! is_array( $record ) || ! isset( $record['user_id'], $record['mime_type'], $record['size_bytes'] ) ) {
			return null;
		}

		return [
			'user_id'    => (int) $record['user_id'],
			'mime_type'  => (string) $record['mime_type'],
			'size_bytes' => (int) $record['size_bytes'],
			'created_at' => (int) ( $record['created_at'] ?? 0 ),
		];
	}

	/**
	 * Drops the record (finalised or rejected).
	 *
	 * @since 1.0.40
	 *
	 * @param string $key Object key.
	 *
	 * @return void
	 */
	public function forget( string $key ): void {
		delete_transient( $this->transient_key( $key ) );
	}

	/**
	 * Transient name for an object key (fixed length, option-name safe).
	 *
	 * @param string $key Object key.
	 *
	 * @return string
	 */
	private function transient_key( string $key ): string {
		return self::PREFIX . md5( $key );
	}
}
