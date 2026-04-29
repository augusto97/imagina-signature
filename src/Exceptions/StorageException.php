<?php
/**
 * Storage-layer errors (driver misconfigured, network failure, etc.).
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class StorageException extends ImaginaSignaturesException {}
