<?php
/**
 * Base model.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

defined( 'ABSPATH' ) || exit;

/**
 * Common parent for the plugin's persistent value objects.
 *
 * Models are deliberately dumb: they hold typed properties hydrated
 * from a DB row, expose a {@see to_array()} for REST serialisation,
 * and otherwise stay out of the way. Domain operations (validation,
 * persistence, side effects) live in `Services\` and `Repositories\`,
 * not here.
 *
 * Each concrete model defines a static `from_row(array)` factory that
 * coerces the string-typed DB result into the right PHP type.
 *
 * @since 1.0.0
 */
abstract class BaseModel {

	/**
	 * Primary key.
	 *
	 * @var int
	 */
	public int $id = 0;

	/**
	 * UTC creation timestamp (`Y-m-d H:i:s`).
	 *
	 * @var string
	 */
	public string $created_at = '';

	/**
	 * Returns an array representation suitable for REST responses.
	 *
	 * Subclasses must implement this so the wire shape is explicit and
	 * any internal-only fields can be excluded.
	 *
	 * @since 1.0.0
	 *
	 * @return array<string, mixed>
	 */
	abstract public function to_array(): array;
}
