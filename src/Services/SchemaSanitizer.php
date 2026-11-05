<?php
/**
 * Recursive signature-schema sanitizer.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

defined( 'ABSPATH' ) || exit;

/**
 * Walks a decoded signature / template schema — including every
 * schema 1.1 container column (`columns[].children`) and the 1.0
 * `children` / `right_children` lists, at any depth — and neutralises
 * the fields that end up in the compiled email:
 *
 *  - Rich-text HTML (`text.content`, any `html` / `*_html` key, and
 *    `content` on block types not known to be plain text) goes through
 *    {@see HtmlSanitizer::sanitize()} (wp_kses, email-safe allowlist).
 *  - URL-ish fields (`href`, `url`, `link`, `src`, `website`, any
 *    `*_url` / `*_href` key — image_url, static_fallback_url, vCard
 *    file URLs, social network URLs, banner / campaign URLs…) are
 *    validated with {@see HtmlSanitizer::sanitize_url()}. A rejected
 *    value (`javascript:`, `data:`, `vbscript:`, …) is replaced with
 *    `''` and a note is recorded — the save still succeeds.
 *  - Every other string leaf (labels, alt text, plain-text heading /
 *    disclaimer content, canvas values) has markup stripped when it
 *    contains any.
 *  - `{{variable}}` values additionally lose script / data URLs,
 *    since they are substituted into link targets at compile time.
 *  - Style objects (schema 1.1) are rebuilt from an allowlist: any
 *    block's / column's `box` (colours, border sides, radius, padding,
 *    alignment, width), a container's `divider`, and column `width` /
 *    `valign`. Invalid colours, numbers or enums are dropped (with a
 *    note) instead of reaching the compiler.
 *
 * Structural validation and size limits live in
 * {@see JsonSchemaValidator}; this class never throws.
 *
 * @since 1.0.40
 */
final class SchemaSanitizer {

	/**
	 * Keys holding URLs regardless of block type.
	 *
	 * @var string[]
	 */
	private const URL_KEYS = [ 'href', 'url', 'link', 'src', 'website' ];

	/**
	 * Block types whose `content` is plain text (escaped at compile
	 * time), not HTML — kses would entity-encode their ampersands.
	 *
	 * @var string[]
	 */
	private const PLAIN_CONTENT_TYPES = [ 'heading', 'disclaimer' ];

	/**
	 * Keys holding nested block arrays directly on a block (schema 1.0).
	 *
	 * @var string[]
	 */
	private const CHILD_KEYS = [ 'children', 'right_children' ];

	/**
	 * Colour keywords accepted in style fields (mirrors the editor's
	 * `safeColor()`).
	 *
	 * @var string[]
	 */
	private const NAMED_COLORS = [
		'transparent',
		'black',
		'white',
		'red',
		'green',
		'blue',
		'gray',
		'grey',
		'silver',
		'navy',
		'maroon',
		'orange',
		'purple',
		'teal',
		'yellow',
		'olive',
		'lime',
		'aqua',
		'fuchsia',
	];

	/**
	 * Border line styles.
	 *
	 * @var string[]
	 */
	private const BORDER_STYLES = [ 'solid', 'dashed', 'dotted' ];

	/**
	 * `box` keys holding a single border side.
	 *
	 * @var string[]
	 */
	private const BOX_BORDER_KEYS = [ 'border', 'border_top', 'border_right', 'border_bottom', 'border_left' ];

	/**
	 * @var HtmlSanitizer
	 */
	private HtmlSanitizer $html;

	/**
	 * Notes recorded by the last {@see sanitize()} call.
	 *
	 * @var array<int, array{path: string, message: string}>
	 */
	private array $notes = [];

	/**
	 * @param HtmlSanitizer $html HTML / URL primitives.
	 */
	public function __construct( HtmlSanitizer $html ) {
		$this->html = $html;
	}

	/**
	 * Returns a sanitised copy of the schema.
	 *
	 * @since 1.0.40
	 *
	 * @param array<string, mixed> $schema Decoded (already structurally validated) schema.
	 *
	 * @return array<string, mixed>
	 */
	public function sanitize( array $schema ): array {
		$this->notes = [];

		foreach ( $schema as $key => $value ) {
			$key = (string) $key;

			if ( 'blocks' === $key && is_array( $value ) ) {
				$schema[ $key ] = $this->sanitize_block_list( $value, 'blocks' );
				continue;
			}

			if ( 'variables' === $key && is_array( $value ) ) {
				$schema[ $key ] = $this->sanitize_variables( $value );
				continue;
			}

			$schema[ $key ] = $this->sanitize_value( $value, $key, '', $key );
		}

		return SchemaShape::restore_objects( $schema );
	}

	/**
	 * Notes about values removed by the last {@see sanitize()} call.
	 *
	 * @since 1.0.40
	 *
	 * @return array<int, array{path: string, message: string}>
	 */
	public function notes(): array {
		return $this->notes;
	}

	/**
	 * Sanitises a list of blocks.
	 *
	 * @param array<int|string, mixed> $blocks Block list.
	 * @param string                   $path   JSON path of the list.
	 *
	 * @return array<int|string, mixed>
	 */
	private function sanitize_block_list( array $blocks, string $path ): array {
		foreach ( $blocks as $index => $block ) {
			$block_path       = $path . '[' . $index . ']';
			$blocks[ $index ] = is_array( $block )
				? $this->sanitize_block( $block, $block_path )
				: $block;
		}
		return $blocks;
	}

	/**
	 * Sanitises one block (and, recursively, its children).
	 *
	 * @param array<string, mixed> $block Block object.
	 * @param string               $path  JSON path of the block.
	 *
	 * @return array<string, mixed>
	 */
	private function sanitize_block( array $block, string $path ): array {
		$type = isset( $block['type'] ) && is_string( $block['type'] ) ? $block['type'] : '';

		foreach ( $block as $key => $value ) {
			$key        = (string) $key;
			$field_path = $path . '.' . $key;

			if ( in_array( $key, self::CHILD_KEYS, true ) && is_array( $value ) ) {
				$block[ $key ] = $this->sanitize_block_list( $value, $field_path );
				continue;
			}

			// Schema 1.1 container columns (in 1.0 `columns` is an int).
			if ( 'columns' === $key && is_array( $value ) ) {
				$block[ $key ] = $this->sanitize_columns( $value, $field_path );
				continue;
			}

			if ( 'box' === $key ) {
				$box = is_array( $value ) ? $this->sanitize_box( $value, $field_path ) : [];
				if ( [] === $box ) {
					unset( $block[ $key ] );
				} else {
					$block[ $key ] = $box;
				}
				continue;
			}

			if ( 'divider' === $key && 'container' === $type ) {
				$divider = is_array( $value ) ? $this->sanitize_border_side( $value ) : null;
				if ( null === $divider ) {
					if ( null !== $value ) {
						$this->note( $field_path, 'Removed an invalid column divider.' );
					}
					unset( $block[ $key ] );
				} else {
					$block[ $key ] = $divider;
				}
				continue;
			}

			$block[ $key ] = $this->sanitize_value( $value, $key, $type, $field_path );
		}

		return $block;
	}

	/**
	 * Sanitises a schema 1.1 container's columns: children are block
	 * lists, `box` / `width` / `valign` are style fields, anything else
	 * is treated like any other value.
	 *
	 * @param array<int|string, mixed> $columns Column list.
	 * @param string                   $path    JSON path of the list.
	 *
	 * @return array<int|string, mixed>
	 */
	private function sanitize_columns( array $columns, string $path ): array {
		foreach ( $columns as $index => $column ) {
			$column_path = $path . '[' . $index . ']';
			if ( ! is_array( $column ) ) {
				$columns[ $index ] = $this->sanitize_value( $column, 'columns', 'container', $column_path );
				continue;
			}

			foreach ( $column as $key => $value ) {
				$key        = (string) $key;
				$field_path = $column_path . '.' . $key;

				switch ( $key ) {
					case 'children':
						$column[ $key ] = is_array( $value )
							? $this->sanitize_block_list( $value, $field_path )
							: [];
						break;

					case 'box':
						$box = is_array( $value ) ? $this->sanitize_box( $value, $field_path ) : [];
						if ( [] === $box ) {
							unset( $column[ $key ] );
						} else {
							$column[ $key ] = $box;
						}
						break;

					case 'width':
						$width = $this->number( $value, 0, 100 );
						if ( null === $width ) {
							$this->note( $field_path, 'Removed an invalid column width.' );
							unset( $column[ $key ] );
						} else {
							$column[ $key ] = $width;
						}
						break;

					case 'valign':
						if ( ! in_array( $value, [ 'top', 'middle', 'bottom' ], true ) ) {
							$this->note( $field_path, 'Removed an invalid vertical alignment.' );
							unset( $column[ $key ] );
						}
						break;

					default:
						$column[ $key ] = $this->sanitize_value( $value, $key, 'container', $field_path );
				}
			}

			$columns[ $index ] = $column;
		}

		return $columns;
	}

	/**
	 * Rebuilds a `box` style object from its allowlisted fields.
	 *
	 * @since 1.1.0
	 *
	 * @param array<string, mixed> $box  Candidate box.
	 * @param string               $path JSON path, for notes.
	 *
	 * @return array<string, mixed> Clean box (empty when nothing valid is left).
	 */
	private function sanitize_box( array $box, string $path ): array {
		$out = [];

		foreach ( $box as $key => $value ) {
			$key        = (string) $key;
			$field_path = $path . '.' . $key;

			if ( 'background_color' === $key ) {
				$color = $this->color( $value );
				if ( null === $color ) {
					$this->note( $field_path, 'Removed an invalid colour.' );
				} else {
					$out[ $key ] = $color;
				}
				continue;
			}

			if ( in_array( $key, self::BOX_BORDER_KEYS, true ) ) {
				$side = is_array( $value ) ? $this->sanitize_border_side( $value ) : null;
				if ( null === $side ) {
					$this->note( $field_path, 'Removed an invalid border.' );
				} else {
					$out[ $key ] = $side;
				}
				continue;
			}

			if ( 'border_radius' === $key || 'width' === $key ) {
				$number = 'width' === $key ? $this->number( $value, 0, 4000 ) : $this->number( $value, 0, 999 );
				if ( null === $number ) {
					$this->note( $field_path, 'Removed an invalid number.' );
				} elseif ( 'width' !== $key || $number > 0 ) {
					// A 0 width means "no fixed width": drop it rather than
					// shipping a 1px box.
					$out[ $key ] = $number;
				}
				continue;
			}

			if ( 'padding' === $key ) {
				if ( ! is_array( $value ) ) {
					$this->note( $field_path, 'Removed an invalid padding.' );
					continue;
				}
				$padding = [];
				foreach ( [ 'top', 'right', 'bottom', 'left' ] as $side ) {
					$padding[ $side ] = $this->number( $value[ $side ] ?? 0, 0, 400 ) ?? 0;
				}
				$out[ $key ] = $padding;
				continue;
			}

			if ( 'align' === $key ) {
				if ( in_array( $value, [ 'left', 'center', 'right' ], true ) ) {
					$out[ $key ] = $value;
				} else {
					$this->note( $field_path, 'Removed an invalid alignment.' );
				}
				continue;
			}

			$this->note( $field_path, 'Removed an unknown box style field.' );
		}

		return $out;
	}

	/**
	 * Validates one border side (`{ width, style, color }`).
	 *
	 * @since 1.1.0
	 *
	 * @param array<string, mixed> $side Candidate side.
	 *
	 * @return array{width: int|float, style: string, color: string}|null Null when invalid (callers add the note).
	 */
	private function sanitize_border_side( array $side ): ?array {
		$width = $this->number( $side['width'] ?? null, 0, 50 );
		$color = $this->color( $side['color'] ?? null );
		if ( null === $width || null === $color ) {
			return null;
		}
		$style = isset( $side['style'] ) && in_array( $side['style'], self::BORDER_STYLES, true )
			? (string) $side['style']
			: 'solid';

		return [
			'width' => $width,
			'style' => $style,
			'color' => $color,
		];
	}

	/**
	 * A CSS colour the compiler can ship safely (`#rgb`, `#rgba`,
	 * `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()` or a short keyword list),
	 * trimmed; `null` for anything else.
	 *
	 * @param mixed $value Candidate.
	 *
	 * @return string|null
	 */
	private function color( $value ): ?string {
		if ( ! is_string( $value ) ) {
			return null;
		}
		$color = trim( $value );
		if ( 1 === preg_match( '/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $color ) ) {
			return $color;
		}
		$channel = '\s*\d{1,3}(?:\.\d+)?%?\s*';
		$alpha   = '\s*(?:0|1|0?\.\d+|\d{1,3}%)\s*';
		if ( 1 === preg_match( '/^rgba?\(' . $channel . ',' . $channel . ',' . $channel . '(?:,' . $alpha . ')?\)$/i', $color ) ) {
			return $color;
		}
		if ( in_array( strtolower( $color ), self::NAMED_COLORS, true ) ) {
			return strtolower( $color );
		}
		return null;
	}

	/**
	 * A JSON number clamped to `[min, max]` (integers stay integers),
	 * or `null` when `$value` is not numeric.
	 *
	 * @param mixed     $value Candidate.
	 * @param int|float $min   Lower bound.
	 * @param int|float $max   Upper bound.
	 *
	 * @return int|float|null
	 */
	private function number( $value, $min, $max ) {
		if ( is_bool( $value ) || ! is_numeric( $value ) ) {
			return null;
		}
		$number = max( $min, min( $max, 0 + $value ) );
		if ( is_float( $number ) && floor( $number ) === $number ) {
			return (int) $number;
		}
		return is_float( $number ) ? round( $number, 2 ) : $number;
	}

	/**
	 * Sanitises any JSON value according to the key it sits under.
	 *
	 * List elements inherit their parent's key so `urls: ["…"]` is
	 * treated like `url`.
	 *
	 * @param mixed  $value      Value.
	 * @param string $key        Key the value sits under.
	 * @param string $block_type Enclosing block type ('' outside blocks).
	 * @param string $path       JSON path, for notes.
	 *
	 * @return mixed
	 */
	private function sanitize_value( $value, string $key, string $block_type, string $path ) {
		if ( is_array( $value ) ) {
			foreach ( $value as $child_key => $child ) {
				$is_list        = is_int( $child_key );
				$child_key_name = $is_list ? $key : (string) $child_key;
				$child_path     = $is_list ? $path . '[' . $child_key . ']' : $path . '.' . $child_key;

				$value[ $child_key ] = $this->sanitize_value( $child, $child_key_name, $block_type, $child_path );
			}
			return $value;
		}

		if ( ! is_string( $value ) ) {
			return $value;
		}

		switch ( $this->classify( $key, $block_type ) ) {
			case 'html':
				$clean = $this->html->sanitize( $value );
				if ( $clean !== $value ) {
					$this->note( $path, 'Removed HTML that is not allowed in signatures.' );
				}
				return $clean;

			case 'url':
				$clean = $this->html->sanitize_url( $value );
				if ( null === $clean ) {
					$this->note( $path, 'Removed a URL with a disallowed scheme (only http, https, mailto and tel links are allowed).' );
					return '';
				}
				return $clean;

			default:
				$clean = $this->html->strip_markup( $value );
				if ( $clean !== $value ) {
					$this->note( $path, 'Removed markup from a plain-text field.' );
				}
				return $clean;
		}
	}

	/**
	 * Sanitises the `variables` map (plain text substituted at compile
	 * time, sometimes into `href`s).
	 *
	 * @param array<int|string, mixed> $variables Variables map.
	 *
	 * @return array<int|string, mixed>
	 */
	private function sanitize_variables( array $variables ): array {
		foreach ( $variables as $name => $value ) {
			$path = 'variables.' . $name;

			if ( ! is_string( $value ) ) {
				$variables[ $name ] = $this->sanitize_value( $value, (string) $name, '', $path );
				continue;
			}

			if ( $this->html->is_script_url( $value ) ) {
				$this->note( $path, 'Removed a script or data URL from a variable value.' );
				$variables[ $name ] = '';
				continue;
			}

			$clean = $this->html->strip_markup( $value );
			if ( $clean !== $value ) {
				$this->note( $path, 'Removed markup from a variable value.' );
			}
			$variables[ $name ] = $clean;
		}

		return $variables;
	}

	/**
	 * Decides how a string field is treated.
	 *
	 * @param string $key        Field key.
	 * @param string $block_type Enclosing block type.
	 *
	 * @return string `html` | `url` | `text`.
	 */
	private function classify( string $key, string $block_type ): string {
		$key = strtolower( $key );

		if ( 'html' === $key || '_html' === substr( $key, -5 ) ) {
			return 'html';
		}

		if ( 'content' === $key && '' !== $block_type ) {
			return in_array( $block_type, self::PLAIN_CONTENT_TYPES, true ) ? 'text' : 'html';
		}

		if ( in_array( $key, self::URL_KEYS, true ) || '_url' === substr( $key, -4 ) || '_href' === substr( $key, -5 ) ) {
			return 'url';
		}

		return 'text';
	}

	/**
	 * Records a sanitisation note.
	 *
	 * @param string $path    JSON path.
	 * @param string $message Human-readable message.
	 *
	 * @return void
	 */
	private function note( string $path, string $message ): void {
		$this->notes[] = [
			'path'    => $path,
			'message' => $message,
		];
	}
}
