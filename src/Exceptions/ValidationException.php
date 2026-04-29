<?php
/**
 * Validation error.
 *
 * @package ImaginaSignatures\Exceptions
 */

declare(strict_types=1);

namespace ImaginaSignatures\Exceptions;

defined( 'ABSPATH' ) || exit;

/**
 * Thrown when input fails schema or business validation.
 *
 * Carries a structured `$errors` payload alongside the message so REST
 * controllers can return a `400 Bad Request` with field-level error
 * detail (CLAUDE.md §5.4).
 *
 * Each entry in `$errors` is `[ 'path' => string, 'message' => string ]`.
 *
 * @since 1.0.0
 */
class ValidationException extends ImaginaSignaturesException {

	/**
	 * Field-level error details.
	 *
	 * @var array<int, array{path: string, message: string}>
	 */
	private array $errors;

	/**
	 * @param string                                                $message Human-readable summary.
	 * @param array<int, array{path: string, message: string}>     $errors  Field-level errors.
	 * @param \Throwable|null                                       $previous Previous throwable for chaining.
	 */
	public function __construct( string $message, array $errors = [], ?\Throwable $previous = null ) {
		parent::__construct( $message, 0, $previous );
		$this->errors = $errors;
	}

	/**
	 * Returns the structured field-level errors.
	 *
	 * @since 1.0.0
	 *
	 * @return array<int, array{path: string, message: string}>
	 */
	public function get_errors(): array {
		return $this->errors;
	}
}
