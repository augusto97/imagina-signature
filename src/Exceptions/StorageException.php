<?php
/**
 * Storage-layer exception.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

defined( 'ABSPATH' ) || exit;

/**
 * Thrown when the active storage driver fails an operation.
 *
 * Examples: unreachable S3 endpoint, presign signature mismatch, permission
 * denied on the local uploads dir, malformed configuration. REST controllers
 * map this to a 5xx response in the storage namespace and a 4xx in the
 * configuration namespace (CLAUDE.md §5.4).
 *
 * @since 1.0.0
 */
class StorageException extends ImaginaSignaturesException {
}
