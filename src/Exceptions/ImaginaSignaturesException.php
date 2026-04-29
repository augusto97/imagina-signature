<?php
/**
 * Base exception for the plugin.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

defined( 'ABSPATH' ) || exit;

/**
 * Root of the plugin's exception hierarchy.
 *
 * Inherits from `RuntimeException` (CLAUDE.md §5.4): plugin errors are
 * runtime conditions, not logic errors callers can recover from at the
 * code level. Sub-classes refine the category (ValidationException,
 * StorageException, OwnershipException, RateLimitException) so callers —
 * particularly REST controllers — can branch on the category and
 * translate to the right WP_Error status code.
 *
 * @since 1.0.0
 */
class ImaginaSignaturesException extends \RuntimeException {
}
