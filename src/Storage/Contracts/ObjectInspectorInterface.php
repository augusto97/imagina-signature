<?php
/**
 * Optional contract for drivers that can inspect stored objects.
 *
 * @package ImaginaSignatures\Storage\Contracts
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\Contracts;

defined( 'ABSPATH' ) || exit;

/**
 * Lets the upload finalize step verify a browser-direct (presigned)
 * upload against what `/upload/init` authorised: the stored object's
 * real Content-Type and Content-Length, and — for small text formats
 * such as vCards — its first bytes.
 *
 * Kept separate from {@see StorageDriverInterface} so third-party
 * drivers written against the original contract keep working.
 *
 * @since 1.0.40
 */
interface ObjectInspectorInterface {

	/**
	 * Returns the stored object's metadata, or null when it doesn't
	 * exist (or can't be read). Never throws.
	 *
	 * @since 1.0.40
	 *
	 * @param string $key Storage key.
	 *
	 * @return array{content_type: string, content_length: int}|null
	 */
	public function describe_object( string $key ): ?array;

	/**
	 * Returns up to `$bytes` bytes from the start of the object, or
	 * null on failure. Never throws.
	 *
	 * @since 1.0.40
	 *
	 * @param string $key   Storage key.
	 * @param int    $bytes Number of bytes to read.
	 *
	 * @return string|null
	 */
	public function read_object_prefix( string $key, int $bytes ): ?string;
}
