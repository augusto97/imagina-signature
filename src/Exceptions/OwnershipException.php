<?php
/**
 * Thrown when a user attempts to access a resource owned by someone else.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OwnershipException extends ImaginaSignaturesException {}
