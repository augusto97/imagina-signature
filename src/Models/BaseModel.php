<?php
/**
 * Abstract base for plain-data models.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Tiny base class shared by every entity.
 *
 * @since 1.0.0
 */
abstract class BaseModel {

	/**
	 * Returns the array representation of the model.
	 *
	 * @return array<string, mixed>
	 */
	abstract public function to_array(): array;

	/**
	 * Hydrates a model from a database row.
	 *
	 * @param array<string, mixed> $row Row.
	 *
	 * @return static
	 */
	abstract public static function from_row( array $row ): self;
}
