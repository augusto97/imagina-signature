<?php
/**
 * Thrown when a plan limit would be exceeded by the requested operation.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Quota violation exception.
 *
 * @since 1.0.0
 */
class QuotaExceededException extends ImaginaSignaturesException {}
