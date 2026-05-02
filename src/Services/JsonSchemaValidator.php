<?php
/**
 * JSON Schema validator (minimal MVP).
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Exceptions\ValidationException;

defined( 'ABSPATH' ) || exit;

/**
 * Coarse-grained shape validator for the signature JSON schema.
 *
 * Sprint 5 will land the full TS / PHP equivalent validator
 * (CLAUDE.md §8.2). Until then this class enforces the bare-minimum
 * invariants that prevent garbage rows in `imgsig_signatures`:
 *
 *  - `schema_version` matches the supported version.
 *  - `meta`, `canvas`, `blocks`, `variables` keys exist with the
 *    right top-level type.
 *  - Every block carries an `id` and `type` string.
 *
 * Anything finer (block-specific field shapes, range checks, format
 * constraints) lands in Sprint 5 alongside the TypeScript validator
 * — the two must produce identical verdicts so the editor and the
 * REST layer never disagree on what's valid.
 *
 * @since 1.0.0
 */
final class JsonSchemaValidator {

	/**
	 * Schema version this validator understands.
	 */
	public const SUPPORTED_VERSION = '1.0';

	/**
	 * Required top-level keys.
	 *
	 * @var string[]
	 */
	private const REQUIRED_KEYS = [ 'schema_version', 'meta', 'canvas', 'blocks', 'variables' ];

	/**
	 * Allowlist of block `type` strings the editor knows how to render
	 * and the compiler knows how to emit. Mirrors CLAUDE.md §10.2 + the
	 * 1.0.11 / 1.0.15 additions (qr_code, banner, vcard).
	 *
	 * Rejecting unknown types at validation time stops a malicious
	 * payload from persisting `type:"system_command"` blocks that a
	 * third-party extension might trust later.
	 *
	 * Extensions can broaden this set via the
	 * `imgsig/schema/allowed_block_types` filter (added 1.0.25).
	 *
	 * @var string[]
	 */
	private const KNOWN_BLOCK_TYPES = [
		'text',
		'heading',
		'image',
		'avatar',
		'divider',
		'spacer',
		'social_icons',
		'contact_row',
		'button_cta',
		'disclaimer',
		'container',
		'qr_code',
		'banner',
		'vcard',
	];

	/**
	 * Validates the decoded signature payload.
	 *
	 * Throws on any failure; returns void on success. Errors are
	 * collected before throwing so the response can list every
	 * problem at once instead of one-at-a-time.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $data Decoded signature schema.
	 *
	 * @return void
	 *
	 * @throws ValidationException When validation fails.
	 */
	public function validate( array $data ): void {
		$errors = [];

		foreach ( self::REQUIRED_KEYS as $key ) {
			if ( ! array_key_exists( $key, $data ) ) {
				$errors[] = [
					'path'    => $key,
					'message' => sprintf( 'Missing required key "%s".', $key ),
				];
			}
		}

		if ( isset( $data['schema_version'] ) && self::SUPPORTED_VERSION !== (string) $data['schema_version'] ) {
			$errors[] = [
				'path'    => 'schema_version',
				'message' => sprintf(
					'Unsupported schema version "%s" (expected "%s").',
					(string) $data['schema_version'],
					self::SUPPORTED_VERSION
				),
			];
		}

		if ( isset( $data['canvas'] ) && ! is_array( $data['canvas'] ) ) {
			$errors[] = [
				'path'    => 'canvas',
				'message' => 'canvas must be an object.',
			];
		}

		if ( isset( $data['variables'] ) && ! is_array( $data['variables'] ) ) {
			$errors[] = [
				'path'    => 'variables',
				'message' => 'variables must be an object.',
			];
		}

		if ( isset( $data['blocks'] ) ) {
			if ( ! is_array( $data['blocks'] ) ) {
				$errors[] = [
					'path'    => 'blocks',
					'message' => 'blocks must be an array.',
				];
			} else {
				foreach ( $data['blocks'] as $index => $block ) {
					$errors = array_merge( $errors, $this->validate_block( $block, $index ) );
				}
			}
		}

		if ( ! empty( $errors ) ) {
			throw new ValidationException(
				__( 'Signature payload failed schema validation.', 'imagina-signatures' ),
				$errors
			);
		}
	}

	/**
	 * Validates a single block entry.
	 *
	 * @since 1.0.0
	 *
	 * @param mixed $block Block candidate (anything from the array).
	 * @param int   $index Position in the blocks array.
	 *
	 * @return array<int, array{path: string, message: string}>
	 */
	private function validate_block( $block, int $index ): array {
		$errors = [];
		$path   = 'blocks[' . $index . ']';

		if ( ! is_array( $block ) ) {
			return [
				[
					'path'    => $path,
					'message' => 'Block must be an object.',
				],
			];
		}

		if ( empty( $block['id'] ) || ! is_string( $block['id'] ) ) {
			$errors[] = [
				'path'    => $path . '.id',
				'message' => 'Block must carry a non-empty string id.',
			];
		}

		if ( empty( $block['type'] ) || ! is_string( $block['type'] ) ) {
			$errors[] = [
				'path'    => $path . '.type',
				'message' => 'Block must carry a non-empty string type.',
			];
		} else {
			/**
			 * Filters the allowed block-type list.
			 *
			 * Extensions that register custom block types client-side
			 * must add the same type strings here so the server-side
			 * validator doesn't reject them on save.
			 *
			 * @since 1.0.25
			 *
			 * @param string[] $known Default allowed types.
			 */
			$allowed = apply_filters( 'imgsig/schema/allowed_block_types', self::KNOWN_BLOCK_TYPES );
			if ( ! in_array( $block['type'], (array) $allowed, true ) ) {
				$errors[] = [
					'path'    => $path . '.type',
					'message' => sprintf( 'Unknown block type "%s".', (string) $block['type'] ),
				];
			}
		}

		return $errors;
	}
}
