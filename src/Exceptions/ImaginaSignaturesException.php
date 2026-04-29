<?php
/**
 * Base exception type for the plugin.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Marker exception used as the parent of every domain-level exception.
 *
 * @since 1.0.0
 */
class ImaginaSignaturesException extends \RuntimeException {}
