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
 * container's `children` / `right_children`, at any depth — and
 * neutralises the fields that end up in the compiled email:
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
	 * Keys holding nested block arrays.
	 *
	 * @var string[]
	 */
	private const CHILD_KEYS = [ 'children', 'right_children' ];

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

			$block[ $key ] = $this->sanitize_value( $value, $key, $type, $field_path );
		}

		return $block;
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
