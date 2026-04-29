<?php
/**
 * Validator for the signature JSON schema (1.0).
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Exceptions\ValidationException;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Validates the signature JSON schema before persistence and rendering.
 *
 * The validator mirrors the TS validator that runs in the editor, so a
 * payload accepted in one place is accepted in the other.
 *
 * @since 1.0.0
 */
final class JsonSchemaValidator {

	private const SCHEMA_VERSION = '1.0';

	private const ALLOWED_BLOCK_TYPES = [
		'text',
		'text_stack',
		'image',
		'divider',
		'spacer',
		'social_icons',
		'contact_row',
		'button_cta',
		'disclaimer',
		'container',
	];

	/**
	 * Validates the signature schema. Throws on failure.
	 *
	 * @param array<string, mixed> $data Decoded JSON payload.
	 *
	 * @return void
	 *
	 * @throws ValidationException When validation fails.
	 */
	public function validate( array $data ): void {
		$errors = [];

		if ( ! isset( $data['schema_version'] ) || self::SCHEMA_VERSION !== $data['schema_version'] ) {
			$errors[] = [ 'path' => 'schema_version', 'message' => 'Invalid or missing schema_version' ];
		}

		if ( ! isset( $data['canvas'] ) || ! is_array( $data['canvas'] ) ) {
			$errors[] = [ 'path' => 'canvas', 'message' => 'Missing canvas configuration' ];
		} else {
			$canvas = $data['canvas'];
			if ( ! isset( $canvas['width'] ) || ! is_int( $canvas['width'] ) ) {
				$errors[] = [ 'path' => 'canvas.width', 'message' => 'Width must be an integer' ];
			} elseif ( $canvas['width'] < 320 || $canvas['width'] > 800 ) {
				$errors[] = [ 'path' => 'canvas.width', 'message' => 'Width must be between 320 and 800' ];
			}
			if ( isset( $canvas['background_color'] ) && ! $this->is_color( (string) $canvas['background_color'] ) ) {
				$errors[] = [ 'path' => 'canvas.background_color', 'message' => 'Invalid color' ];
			}
			if ( isset( $canvas['text_color'] ) && ! $this->is_color( (string) $canvas['text_color'] ) ) {
				$errors[] = [ 'path' => 'canvas.text_color', 'message' => 'Invalid color' ];
			}
			if ( isset( $canvas['link_color'] ) && ! $this->is_color( (string) $canvas['link_color'] ) ) {
				$errors[] = [ 'path' => 'canvas.link_color', 'message' => 'Invalid color' ];
			}
		}

		if ( ! isset( $data['blocks'] ) || ! is_array( $data['blocks'] ) ) {
			$errors[] = [ 'path' => 'blocks', 'message' => 'Missing blocks list' ];
		} else {
			foreach ( $data['blocks'] as $i => $block ) {
				if ( ! is_array( $block ) ) {
					$errors[] = [ 'path' => "blocks[$i]", 'message' => 'Block must be an object' ];
					continue;
				}
				$this->validate_block( $block, "blocks[$i]", $errors );
			}
		}

		if ( ! empty( $errors ) ) {
			throw new ValidationException(
				__( 'Signature schema validation failed.', 'imagina-signatures' ),
				$errors
			);
		}
	}

	/**
	 * Whether the given payload is a valid color (`#abc`, `#aabbcc`, `transparent`).
	 *
	 * @param string $value Candidate color.
	 *
	 * @return bool
	 */
	private function is_color( string $value ): bool {
		if ( 'transparent' === $value ) {
			return true;
		}
		return (bool) preg_match( '/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $value );
	}

	/**
	 * Validates a single block.
	 *
	 * @param array<string, mixed>                                   $block  Block.
	 * @param string                                                 $path   JSON path prefix.
	 * @param array<int, array{path:string, message:string}>         $errors Accumulator (by ref).
	 *
	 * @return void
	 */
	private function validate_block( array $block, string $path, array &$errors ): void {
		if ( ! isset( $block['id'] ) || ! is_string( $block['id'] ) || '' === $block['id'] ) {
			$errors[] = [ 'path' => $path . '.id', 'message' => 'Missing block id' ];
		}
		if ( ! isset( $block['type'] ) || ! in_array( $block['type'], self::ALLOWED_BLOCK_TYPES, true ) ) {
			$errors[] = [ 'path' => $path . '.type', 'message' => 'Invalid block type' ];
			return;
		}

		switch ( $block['type'] ) {
			case 'image':
				if ( ! isset( $block['src'] ) || ! is_string( $block['src'] ) ) {
					$errors[] = [ 'path' => $path . '.src', 'message' => 'Image block requires src' ];
				} elseif ( ! $this->is_safe_image_src( $block['src'] ) ) {
					$errors[] = [ 'path' => $path . '.src', 'message' => 'Image src must be http(s) or data:image/*' ];
				}
				if ( ! isset( $block['alt'] ) || ! is_string( $block['alt'] ) ) {
					$errors[] = [ 'path' => $path . '.alt', 'message' => 'Image block requires alt text' ];
				}
				break;
			case 'social_icons':
				if ( ! isset( $block['networks'] ) || ! is_array( $block['networks'] ) ) {
					$errors[] = [ 'path' => $path . '.networks', 'message' => 'Networks must be an array' ];
				}
				break;
			case 'button_cta':
				if ( ! isset( $block['url'] ) || ! is_string( $block['url'] ) || ! $this->is_safe_url( $block['url'] ) ) {
					$errors[] = [ 'path' => $path . '.url', 'message' => 'CTA url must be http(s)/mailto/tel' ];
				}
				break;
			case 'container':
				if ( isset( $block['children'] ) && is_array( $block['children'] ) ) {
					foreach ( $block['children'] as $j => $child ) {
						if ( is_array( $child ) ) {
							$this->validate_block( $child, $path . ".children[$j]", $errors );
						}
					}
				}
				break;
		}
	}

	/**
	 * Allow-listed URL schemes used in signatures.
	 *
	 * @param string $url Candidate URL.
	 *
	 * @return bool
	 */
	private function is_safe_url( string $url ): bool {
		$scheme = strtolower( (string) wp_parse_url( $url, PHP_URL_SCHEME ) );
		return in_array( $scheme, [ 'http', 'https', 'mailto', 'tel' ], true );
	}

	/**
	 * Image-specific src allow-list (adds `data:image/*` to the safe schemes).
	 *
	 * @param string $url Candidate URL.
	 *
	 * @return bool
	 */
	private function is_safe_image_src( string $url ): bool {
		if ( 0 === strpos( strtolower( $url ), 'data:image/' ) ) {
			return true;
		}
		$scheme = strtolower( (string) wp_parse_url( $url, PHP_URL_SCHEME ) );
		return in_array( $scheme, [ 'http', 'https' ], true );
	}
}
