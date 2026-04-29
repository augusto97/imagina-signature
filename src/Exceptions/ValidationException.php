<?php
/**
 * Thrown when input fails schema or business validation.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Validation exception carrying a structured error list.
 *
 * @since 1.0.0
 */
class ValidationException extends ImaginaSignaturesException {

	/**
	 * Structured error list ([{path,message}, ...]).
	 *
	 * @var array<int, array{path:string, message:string}>
	 */
	private array $errors;

	/**
	 * Constructor.
	 *
	 * @param string                                          $message Human-readable summary.
	 * @param array<int, array{path:string, message:string}> $errors  Field-level errors.
	 */
	public function __construct( string $message, array $errors = [] ) {
		parent::__construct( $message );
		$this->errors = $errors;
	}

	/**
	 * Returns the structured error list.
	 *
	 * @return array<int, array{path:string, message:string}>
	 */
	public function get_errors(): array {
		return $this->errors;
	}
}
