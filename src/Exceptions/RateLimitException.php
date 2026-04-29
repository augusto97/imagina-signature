<?php
/**
 * Thrown when a rate-limited action exceeds its budget.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RateLimitException extends ImaginaSignaturesException {}
