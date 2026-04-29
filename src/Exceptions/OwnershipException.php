<?php
/**
 * Ownership / permission error.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

defined( 'ABSPATH' ) || exit;

/**
 * Thrown when the current user does not own the resource being acted on.
 *
 * Distinct from a missing capability: the user has the right capability
 * (e.g. `imgsig_use_signatures`) but they're trying to read or modify
 * a row that belongs to another user. REST controllers map this to
 * `403 Forbidden` (CLAUDE.md §5.4 / §15.3).
 *
 * @since 1.0.0
 */
class OwnershipException extends ImaginaSignaturesException {
}
