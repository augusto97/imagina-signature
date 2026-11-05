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
 *  - Every block — at any nesting depth, including container
 *    `children` / `right_children` — carries an `id` and a known
 *    `type` string.
 *  - Size limits: encoded JSON ≤ 256 KB, block nesting depth ≤ 4,
 *    ≤ 200 blocks in total (filterable via `imgsig/schema/limits`).
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
	 * Maximum encoded size of `json_content`, in bytes (256 KB).
	 */
	public const MAX_JSON_BYTES = 262144;

	/**
	 * Maximum block nesting depth (top-level blocks are depth 1).
	 */
	public const MAX_DEPTH = 4;

	/**
	 * Maximum number of blocks in one schema, counted recursively.
	 */
	public const MAX_BLOCKS = 200;

	/**
	 * Keys holding nested block arrays.
	 *
	 * @var string[]
	 */
	private const CHILD_KEYS = [ 'children', 'right_children' ];

	/**
	 * Running block count for the current {@see validate()} call.
	 *
	 * @var int
	 */
	private int $block_count = 0;

	/**
	 * Allowed block types for the current {@see validate()} call
	 * (resolved lazily, once per call).
	 *
	 * @var string[]|null
	 */
	private ?array $allowed_types = null;

	/**
	 * Limits resolved for the current {@see validate()} call.
	 *
	 * @var array{max_bytes: int, max_depth: int, max_blocks: int}
	 */
	private array $limits = [
		'max_bytes'  => self::MAX_JSON_BYTES,
		'max_depth'  => self::MAX_DEPTH,
		'max_blocks' => self::MAX_BLOCKS,
	];

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
		$errors              = [];
		$this->limits        = $this->resolve_limits();
		$this->block_count   = 0;
		$this->allowed_types = null;

		// Size first: there's no point walking a multi-megabyte tree.
		$encoded = json_encode( $data ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- byte count only; matches the default flags wp_json_encode() stores with.
		$bytes   = is_string( $encoded ) ? strlen( $encoded ) : 0;
		if ( $bytes > $this->limits['max_bytes'] ) {
			throw new ValidationException(
				sprintf(
					/* translators: 1: payload size in KB, 2: maximum size in KB. */
					__( 'The signature is too large (%1$d KB). The maximum is %2$d KB — remove some blocks or shorten long text.', 'imagina-signatures' ),
					(int) ceil( $bytes / 1024 ),
					(int) floor( $this->limits['max_bytes'] / 1024 )
				),
				[
					[
						'path'    => 'json_content',
						'message' => sprintf( 'Encoded payload is %d bytes; the limit is %d.', $bytes, $this->limits['max_bytes'] ),
					],
				]
			);
		}

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
					$errors = array_merge( $errors, $this->validate_block( $block, 'blocks[' . $index . ']', 1 ) );
				}
			}
		}

		$message = __( 'Signature payload failed schema validation.', 'imagina-signatures' );

		if ( $this->block_count > $this->limits['max_blocks'] ) {
			$message = sprintf(
				/* translators: 1: number of blocks, 2: maximum number of blocks. */
				__( 'The signature has %1$d blocks. The maximum is %2$d.', 'imagina-signatures' ),
				$this->block_count,
				$this->limits['max_blocks']
			);
			$errors[] = [
				'path'    => 'blocks',
				'message' => sprintf( 'Too many blocks (%d > %d).', $this->block_count, $this->limits['max_blocks'] ),
			];
		}

		foreach ( $errors as $error ) {
			if ( 'depth' === ( $error['code'] ?? '' ) ) {
				$message = sprintf(
					/* translators: %d: maximum nesting depth. */
					__( 'Blocks are nested too deeply. Containers can be nested at most %d levels.', 'imagina-signatures' ),
					$this->limits['max_depth']
				);
				break;
			}
		}

		if ( ! empty( $errors ) ) {
			throw new ValidationException(
				$message,
				array_map(
					static function ( array $error ): array {
						unset( $error['code'] );
						return $error;
					},
					$errors
				)
			);
		}
	}

	/**
	 * Returns the size / depth / count limits, after the
	 * `imgsig/schema/limits` filter.
	 *
	 * @since 1.0.40
	 *
	 * @return array{max_bytes: int, max_depth: int, max_blocks: int}
	 */
	public function resolve_limits(): array {
		$defaults = [
			'max_bytes'  => self::MAX_JSON_BYTES,
			'max_depth'  => self::MAX_DEPTH,
			'max_blocks' => self::MAX_BLOCKS,
		];

		/**
		 * Filters the signature / template schema limits.
		 *
		 * @since 1.0.40
		 *
		 * @param array{max_bytes: int, max_depth: int, max_blocks: int} $defaults Defaults: 256 KB, depth 4, 200 blocks.
		 */
		$filtered = apply_filters( 'imgsig/schema/limits', $defaults );
		$filtered = is_array( $filtered ) ? $filtered : [];

		$out = [];
		foreach ( $defaults as $key => $default ) {
			$value       = isset( $filtered[ $key ] ) ? (int) $filtered[ $key ] : $default;
			$out[ $key ] = $value > 0 ? $value : $default;
		}

		return $out;
	}

	/**
	 * Validates a single block entry.
	 *
	 * @since 1.0.0
	 *
	 * Recurses into `children` / `right_children` so nested blocks get
	 * the same id / type checks as top-level ones, and tracks the
	 * running block count and nesting depth for the limits.
	 *
	 * @param mixed  $block Block candidate (anything from the array).
	 * @param string $path  JSON path of the block (e.g. `blocks[0].children[1]`).
	 * @param int    $depth Nesting depth (top-level = 1).
	 *
	 * @return array<int, array{path: string, message: string, code?: string}>
	 */
	private function validate_block( $block, string $path, int $depth ): array {
		$errors = [];
		++$this->block_count;

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
			if ( null === $this->allowed_types ) {
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
				$this->allowed_types = (array) apply_filters( 'imgsig/schema/allowed_block_types', self::KNOWN_BLOCK_TYPES );
			}
			if ( ! in_array( $block['type'], $this->allowed_types, true ) ) {
				$errors[] = [
					'path'    => $path . '.type',
					'message' => sprintf( 'Unknown block type "%s".', (string) $block['type'] ),
				];
			}
		}

		if ( $depth > $this->limits['max_depth'] ) {
			$errors[] = [
				'path'    => $path,
				'message' => sprintf( 'Block nesting depth %d exceeds the limit of %d.', $depth, $this->limits['max_depth'] ),
				'code'    => 'depth',
			];
			// Don't descend further: the error is already recorded and a
			// hostile payload could be arbitrarily deep.
			return $errors;
		}

		foreach ( self::CHILD_KEYS as $child_key ) {
			if ( ! array_key_exists( $child_key, $block ) || null === $block[ $child_key ] ) {
				continue;
			}

			if ( ! is_array( $block[ $child_key ] ) ) {
				$errors[] = [
					'path'    => $path . '.' . $child_key,
					'message' => sprintf( '%s must be an array of blocks.', $child_key ),
				];
				continue;
			}

			foreach ( $block[ $child_key ] as $child_index => $child ) {
				// Stop walking once the count limit is blown; the count
				// error is reported once by validate().
				if ( $this->block_count > $this->limits['max_blocks'] ) {
					break 2;
				}
				$errors = array_merge(
					$errors,
					$this->validate_block( $child, $path . '.' . $child_key . '[' . $child_index . ']', $depth + 1 )
				);
			}
		}

		return $errors;
	}
}
