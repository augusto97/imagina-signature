<?php
/**
 * JSON shape helpers for signature schemas.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

defined( 'ABSPATH' ) || exit;

/**
 * Restores the JSON object shape of schema fields after a PHP round trip.
 *
 * `json_decode( $json, true )` turns an empty JSON object `{}` into an
 * empty PHP array, which `wp_json_encode()` then writes back as `[]`.
 * The editor stores user variables in `schema.variables` as an object;
 * receiving `[]` made the browser treat it as an array, and any key
 * added to an array is silently dropped by `JSON.stringify()` — so a
 * user's variables could vanish on the next save.
 *
 * @since 1.1.0
 */
final class SchemaShape {

	/**
	 * Top-level schema keys that must always serialise as JSON objects.
	 *
	 * @var string[]
	 */
	private const OBJECT_KEYS = [ 'variables', 'meta', 'canvas', 'settings', 'overrides' ];

	/**
	 * Returns the schema with empty object fields restored to `stdClass`.
	 *
	 * @since 1.1.0
	 *
	 * @param array<string, mixed> $schema Decoded schema (associative arrays).
	 *
	 * @return array<string, mixed>
	 */
	public static function restore_objects( array $schema ): array {
		foreach ( self::OBJECT_KEYS as $key ) {
			if ( array_key_exists( $key, $schema ) && [] === $schema[ $key ] ) {
				$schema[ $key ] = new \stdClass();
			}
		}
		return $schema;
	}
}
