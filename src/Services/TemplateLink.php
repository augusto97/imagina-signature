<?php
/**
 * Linked signatures: template employee modes, locks and text overrides.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Pure schema operations behind "one design per template".
 *
 * Schema additions (1.3.0):
 *
 *  - `blocks[].locked` (bool)                — an administrator locked the
 *    block: employees can't edit, move, duplicate or delete it (a locked
 *    container locks everything inside it).
 *  - `settings.employee_mode` (templates)    — what employees may change:
 *      - `free`          (default) everything, as before 1.3.0;
 *      - `locked_design` only the text of unlocked text / heading /
 *                        disclaimer blocks (layout, styles fixed);
 *      - `fields_only`   only their variables / profile values.
 *  - `overrides` (linked signatures)         — `{ [blockId]: { content?,
 *    content_html? } }`: the employee's own text on unlocked text-like
 *    blocks, re-applied every time the template design is refreshed.
 *
 * A linked signature's design (canvas + blocks + settings) is always the
 * template's; {@see refresh()} rebuilds it keeping the signature's
 * `variables`, `meta` and applicable `overrides`. {@see enforce()} is the
 * save-time version for employees, and {@see detach()} turns a linked
 * signature into a free copy.
 *
 * Every method accepts decoded JSON in either shape the plugin produces
 * (associative arrays, or `stdClass` for empty objects after
 * {@see SchemaShape::restore_objects()}) and returns plain associative
 * arrays; store them with {@see encode()}.
 *
 * @since 1.3.0
 */
final class TemplateLink {

	public const MODE_FREE          = 'free';
	public const MODE_LOCKED_DESIGN = 'locked_design';
	public const MODE_FIELDS_ONLY   = 'fields_only';

	/**
	 * Every employee mode.
	 *
	 * @var string[]
	 */
	public const MODES = [ self::MODE_FREE, self::MODE_LOCKED_DESIGN, self::MODE_FIELDS_ONLY ];

	/**
	 * Text fields an employee may override, per text-like block type.
	 *
	 * @var array<string, string[]>
	 */
	public const OVERRIDE_FIELDS = [
		'text'       => [ 'content' ],
		'heading'    => [ 'content', 'content_html' ],
		'disclaimer' => [ 'content', 'content_html' ],
	];

	/**
	 * Whether `$user_id` ignores locks and employee modes (template and
	 * team managers).
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return bool
	 */
	public static function can_bypass_locks( int $user_id ): bool {
		if ( $user_id <= 0 ) {
			return false;
		}
		return user_can( $user_id, CapabilitiesInstaller::CAP_MANAGE_TEAM )
			|| user_can( $user_id, CapabilitiesInstaller::CAP_MANAGE_TEMPLATES );
	}

	/**
	 * The employee mode a template (or a signature built from one)
	 * declares. Anything unknown is `free`.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|object $schema Decoded schema.
	 *
	 * @return string One of {@see MODES}.
	 */
	public static function employee_mode( $schema ): string {
		$schema   = self::as_array( $schema );
		$settings = isset( $schema['settings'] ) ? self::as_array( $schema['settings'] ) : [];
		$mode     = $settings['employee_mode'] ?? self::MODE_FREE;
		return is_string( $mode ) && in_array( $mode, self::MODES, true ) ? $mode : self::MODE_FREE;
	}

	/**
	 * Whether a block type carries employee-editable text.
	 *
	 * @since 1.3.0
	 *
	 * @param string $type Block type.
	 *
	 * @return bool
	 */
	public static function is_text_like( string $type ): bool {
		return isset( self::OVERRIDE_FIELDS[ $type ] );
	}

	/**
	 * Indexes a block tree by id: the block and whether it is locked,
	 * itself or through a locked ancestor container.
	 *
	 * @since 1.3.0
	 *
	 * @param array<int|string, mixed> $blocks Block list.
	 *
	 * @return array<string, array{block: array<string, mixed>, locked: bool}>
	 */
	public static function index_blocks( array $blocks ): array {
		$index = [];
		self::walk(
			$blocks,
			static function ( array $block, bool $locked ) use ( &$index ): void {
				if ( isset( $block['id'] ) && is_string( $block['id'] ) && ! isset( $index[ $block['id'] ] ) ) {
					$index[ $block['id'] ] = [
						'block'  => $block,
						'locked' => $locked,
					];
				}
			}
		);
		return $index;
	}

	/**
	 * Rebuilds a linked signature from its template: the template's
	 * design (migrated to the current schema), the signature's variables
	 * (winning over the template's defaults), its `meta`, and its text
	 * overrides on unlocked text-like blocks — none in `fields_only`.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|object $template  Template schema.
	 * @param array<string, mixed>|object $signature Current signature schema (may be empty).
	 * @param string|null                 $now       ISO 8601 time stamped as `meta.updated_at`, or null to keep it.
	 *
	 * @return array<string, mixed>
	 */
	public static function refresh( $template, $signature, ?string $now = null ): array {
		$out       = SchemaMigration::to_current( self::as_array( $template ) );
		$signature = self::as_array( $signature );
		unset( $out['overrides'] );

		$template_variables = self::as_array( $out['variables'] ?? [] );
		$own_variables      = self::as_array( $signature['variables'] ?? [] );
		// `+` keeps the keys exactly (array_merge would renumber "123").
		$out['variables'] = $own_variables + $template_variables;

		$meta = isset( $signature['meta'] ) ? self::as_array( $signature['meta'] ) : [];
		if ( [] === $meta ) {
			$meta = self::as_array( $out['meta'] ?? [] );
		}
		if ( null !== $now ) {
			$meta['updated_at'] = $now;
			if ( empty( $meta['created_at'] ) ) {
				$meta['created_at'] = $now;
			}
		}
		$out['meta'] = $meta;

		$overrides = self::MODE_FIELDS_ONLY === self::employee_mode( $out )
			? []
			: self::applicable_overrides( self::as_array( $signature['overrides'] ?? [] ), $out['blocks'] );

		$out['blocks']    = self::apply_overrides( $out['blocks'], $overrides );
		$out['overrides'] = $overrides;

		return $out;
	}

	/**
	 * Save-time enforcement for an employee saving a linked signature.
	 *
	 *  - `fields_only`   → the template's design with the incoming
	 *                      variables; nothing else is accepted.
	 *  - `locked_design` → the template's design; the text of unlocked
	 *                      text-like blocks the employee changed (or
	 *                      lists in `overrides`) is kept as overrides.
	 *                      Locked blocks, styles, layout and canvas
	 *                      changes are reverted.
	 *  - `free`          → returned as sent (client-side locks only).
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|object $template Template schema.
	 * @param array<string, mixed>|object $incoming Sanitised schema the employee sent.
	 * @param array<string, mixed>|object $stored   Schema currently stored for the signature.
	 *
	 * @return array<string, mixed>
	 */
	public static function enforce( $template, $incoming, $stored ): array {
		$template = SchemaMigration::to_current( self::as_array( $template ) );
		$incoming = self::as_array( $incoming );
		$stored   = self::as_array( $stored );
		$mode     = self::employee_mode( $template );

		if ( self::MODE_FREE === $mode ) {
			return $incoming;
		}

		$variables = array_key_exists( 'variables', $incoming ) ? $incoming['variables'] : ( $stored['variables'] ?? [] );
		$meta      = array_key_exists( 'meta', $incoming ) ? $incoming['meta'] : ( $stored['meta'] ?? [] );

		if ( self::MODE_FIELDS_ONLY === $mode ) {
			return self::refresh(
				$template,
				[
					'variables' => $variables,
					'meta'      => $meta,
				]
			);
		}

		$template_index   = self::index_blocks( $template['blocks'] );
		$incoming_index   = self::index_blocks( isset( $incoming['blocks'] ) && is_array( $incoming['blocks'] ) ? $incoming['blocks'] : [] );
		$listed           = self::as_array( $incoming['overrides'] ?? [] );
		$stored_overrides = self::as_array( $stored['overrides'] ?? [] );
		$overrides        = [];

		foreach ( $template_index as $id => $entry ) {
			$type = (string) ( $entry['block']['type'] ?? '' );
			if ( $entry['locked'] || ! self::is_text_like( $type ) ) {
				continue;
			}

			$fields    = self::OVERRIDE_FIELDS[ $type ];
			$candidate = [];
			$sent      = $incoming_index[ $id ]['block'] ?? null;

			if ( is_array( $sent ) && ( $sent['type'] ?? '' ) === $type ) {
				$listed_fields = isset( $listed[ $id ] ) ? self::as_array( $listed[ $id ] ) : [];
				foreach ( $fields as $field ) {
					if ( ! isset( $sent[ $field ] ) || ! is_string( $sent[ $field ] ) ) {
						continue;
					}
					$original = $entry['block'][ $field ] ?? null;
					if ( $sent[ $field ] !== $original || array_key_exists( $field, $listed_fields ) ) {
						$candidate[ $field ] = $sent[ $field ];
					}
				}
			} else {
				// The block didn't come back (it can't be deleted in this
				// mode): keep whatever text the employee had for it.
				$previous  = $listed[ $id ] ?? ( $stored_overrides[ $id ] ?? [] );
				$candidate = self::pick_fields( self::as_array( $previous ), $fields );
			}

			if ( [] !== $candidate ) {
				$overrides[ $id ] = $candidate;
			}
		}

		return self::refresh(
			$template,
			[
				'variables' => $variables,
				'meta'      => $meta,
				'overrides' => $overrides,
			]
		);
	}

	/**
	 * Turns a linked signature's schema into a free copy: overrides are
	 * merged into their blocks and the `overrides` map is dropped.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|object $schema Signature schema.
	 *
	 * @return array<string, mixed>
	 */
	public static function detach( $schema ): array {
		$schema = self::as_array( $schema );
		if ( isset( $schema['blocks'] ) && is_array( $schema['blocks'] ) ) {
			$overrides        = self::as_array( $schema['overrides'] ?? [] );
			$schema['blocks'] = self::apply_overrides( $schema['blocks'], self::applicable_overrides( $overrides, $schema['blocks'], false ) );
		}
		unset( $schema['overrides'] );
		return $schema;
	}

	/**
	 * A template as the starting point of a detached copy (current
	 * schema, no `overrides`).
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|object $template Template schema.
	 *
	 * @return array<string, mixed>
	 */
	public static function copy_of( $template ): array {
		$schema = SchemaMigration::to_current( self::as_array( $template ) );
		unset( $schema['overrides'] );
		return $schema;
	}

	/**
	 * JSON for storage: empty object fields stay `{}`.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $schema Schema built by this class.
	 *
	 * @return string
	 */
	public static function encode( array $schema ): string {
		return (string) wp_json_encode( SchemaShape::restore_objects( $schema ) );
	}

	/**
	 * Structural equality: key order, `[]` vs `{}` and `1` vs `1.0`
	 * don't matter. With `$ignore_meta`, `meta` is not compared.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $a           First value.
	 * @param mixed $b           Second value.
	 * @param bool  $ignore_meta Skip the top-level `meta` key.
	 *
	 * @return bool
	 */
	public static function equivalent( $a, $b, bool $ignore_meta = false ): bool {
		$a = self::normalize( $a );
		$b = self::normalize( $b );
		if ( $ignore_meta ) {
			if ( is_array( $a ) ) {
				unset( $a['meta'] );
			}
			if ( is_array( $b ) ) {
				unset( $b['meta'] );
			}
		}
		return wp_json_encode( $a ) === wp_json_encode( $b );
	}

	/**
	 * Recursively converts objects to associative arrays.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $value Decoded JSON value.
	 *
	 * @return array<int|string, mixed>
	 */
	public static function as_array( $value ): array {
		if ( is_object( $value ) ) {
			$value = get_object_vars( $value );
		}
		if ( ! is_array( $value ) ) {
			return [];
		}
		foreach ( $value as $key => $item ) {
			if ( is_object( $item ) ) {
				$value[ $key ] = self::as_array( $item );
			} elseif ( is_array( $item ) ) {
				$value[ $key ] = self::as_array( $item );
			}
		}
		return $value;
	}

	/**
	 * Keeps the overrides that target an existing unlocked text-like
	 * block (or any text-like block with `$skip_locked` false), reduced
	 * to that block type's string fields.
	 *
	 * @param array<int|string, mixed> $overrides   Candidate map.
	 * @param array<int|string, mixed> $blocks      Block tree.
	 * @param bool                     $skip_locked Ignore overrides on locked blocks.
	 *
	 * @return array<string, array<string, string>>
	 */
	private static function applicable_overrides( array $overrides, array $blocks, bool $skip_locked = true ): array {
		if ( [] === $overrides ) {
			return [];
		}
		$index = self::index_blocks( $blocks );
		$out   = [];
		foreach ( $overrides as $id => $fields ) {
			$id = (string) $id;
			if ( ! isset( $index[ $id ] ) || ( $skip_locked && $index[ $id ]['locked'] ) ) {
				continue;
			}
			$type = (string) ( $index[ $id ]['block']['type'] ?? '' );
			if ( ! self::is_text_like( $type ) ) {
				continue;
			}
			$picked = self::pick_fields( self::as_array( $fields ), self::OVERRIDE_FIELDS[ $type ] );
			if ( [] !== $picked ) {
				$out[ $id ] = $picked;
			}
		}
		return $out;
	}

	/**
	 * Writes override fields into their blocks (any depth).
	 *
	 * @param array<int|string, mixed>             $blocks    Block list.
	 * @param array<string, array<string, string>> $overrides Applicable overrides.
	 *
	 * @return array<int|string, mixed>
	 */
	private static function apply_overrides( array $blocks, array $overrides ): array {
		if ( [] === $overrides ) {
			return $blocks;
		}
		foreach ( $blocks as $index => $block ) {
			if ( ! is_array( $block ) ) {
				continue;
			}
			$id = isset( $block['id'] ) && is_string( $block['id'] ) ? $block['id'] : '';
			if ( '' !== $id && isset( $overrides[ $id ] ) ) {
				foreach ( $overrides[ $id ] as $field => $value ) {
					$block[ $field ] = $value;
				}
			}
			if ( isset( $block['columns'] ) && is_array( $block['columns'] ) ) {
				foreach ( $block['columns'] as $column_index => $column ) {
					if ( is_array( $column ) && isset( $column['children'] ) && is_array( $column['children'] ) ) {
						$block['columns'][ $column_index ]['children'] = self::apply_overrides( $column['children'], $overrides );
					}
				}
			}
			$blocks[ $index ] = $block;
		}
		return $blocks;
	}

	/**
	 * Pre-order walk (1.1 columns and 1.0 child lists) passing whether
	 * each block is locked itself or through an ancestor.
	 *
	 * @param array<int|string, mixed> $blocks Block list.
	 * @param callable                 $visit  Visitor: `( array $block, bool $locked )`.
	 * @param bool                     $locked Whether an ancestor is locked.
	 *
	 * @return void
	 */
	private static function walk( array $blocks, callable $visit, bool $locked = false ): void {
		foreach ( $blocks as $block ) {
			if ( ! is_array( $block ) ) {
				continue;
			}
			$is_locked = $locked || true === ( $block['locked'] ?? false );
			$visit( $block, $is_locked );

			if ( isset( $block['columns'] ) && is_array( $block['columns'] ) ) {
				foreach ( $block['columns'] as $column ) {
					if ( is_array( $column ) && isset( $column['children'] ) && is_array( $column['children'] ) ) {
						self::walk( $column['children'], $visit, $is_locked );
					}
				}
			}
			foreach ( [ 'children', 'right_children' ] as $key ) {
				if ( isset( $block[ $key ] ) && is_array( $block[ $key ] ) ) {
					self::walk( $block[ $key ], $visit, $is_locked );
				}
			}
		}
	}

	/**
	 * The string values of `$fields` present in `$source`.
	 *
	 * @param array<int|string, mixed> $source Candidate.
	 * @param string[]                 $fields Allowed keys.
	 *
	 * @return array<string, string>
	 */
	private static function pick_fields( array $source, array $fields ): array {
		$out = [];
		foreach ( $fields as $field ) {
			if ( isset( $source[ $field ] ) && is_string( $source[ $field ] ) ) {
				$out[ $field ] = $source[ $field ];
			}
		}
		return $out;
	}

	/**
	 * Canonical form for {@see equivalent()}.
	 *
	 * @param mixed $value Value.
	 *
	 * @return mixed
	 */
	private static function normalize( $value ) {
		if ( is_object( $value ) ) {
			$value = get_object_vars( $value );
		}
		if ( is_float( $value ) && floor( $value ) === $value && abs( $value ) < PHP_INT_MAX ) {
			return (int) $value;
		}
		if ( ! is_array( $value ) ) {
			return $value;
		}
		$is_list = [] === $value || array_keys( $value ) === range( 0, count( $value ) - 1 );
		foreach ( $value as $key => $item ) {
			$value[ $key ] = self::normalize( $item );
		}
		if ( ! $is_list ) {
			ksort( $value, SORT_STRING );
		}
		return $value;
	}
}
