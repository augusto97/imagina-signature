<?php
/**
 * Signature model.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

defined( 'ABSPATH' ) || exit;

/**
 * One row of `imgsig_signatures` (CLAUDE.md §7.1).
 *
 * Status set is enforced at this layer (the DB column is VARCHAR(20)
 * for dbDelta-friendliness; the canonical values live as constants
 * here).
 *
 * @since 1.0.0
 */
final class Signature extends BaseModel {

	public const STATUS_DRAFT    = 'draft';
	public const STATUS_READY    = 'ready';
	public const STATUS_ARCHIVED = 'archived';

	/**
	 * All allowed values for the `status` column.
	 */
	public const STATUSES = [ self::STATUS_DRAFT, self::STATUS_READY, self::STATUS_ARCHIVED ];

	/**
	 * Owner user ID.
	 *
	 * @var int
	 */
	public int $user_id = 0;

	/**
	 * Display name.
	 *
	 * @var string
	 */
	public string $name = '';

	/**
	 * JSON-encoded signature schema (LONGTEXT in the DB).
	 *
	 * Stored as a raw string; services decode it as needed.
	 *
	 * @var string
	 */
	public string $json_content = '';

	/**
	 * Cached compiled HTML, or null when not yet compiled.
	 *
	 * @var string|null
	 */
	public ?string $html_cache = null;

	/**
	 * URL to a preview image, or null.
	 *
	 * @var string|null
	 */
	public ?string $preview_url = null;

	/**
	 * Source template, or null when the signature was built from scratch.
	 *
	 * @var int|null
	 */
	public ?int $template_id = null;

	/**
	 * Status — one of {@see STATUSES}.
	 *
	 * @var string
	 */
	public string $status = self::STATUS_DRAFT;

	/**
	 * Schema version this row was written with.
	 *
	 * @var string
	 */
	public string $schema_version = '1.0';

	/**
	 * UTC last-update timestamp.
	 *
	 * @var string
	 */
	public string $updated_at = '';

	/**
	 * Hydrates a model from a raw DB row.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $row Row from `$wpdb->get_row(..., ARRAY_A)`.
	 *
	 * @return self
	 */
	public static function from_row( array $row ): self {
		$model                 = new self();
		$model->id             = isset( $row['id'] ) ? (int) $row['id'] : 0;
		$model->user_id        = isset( $row['user_id'] ) ? (int) $row['user_id'] : 0;
		$model->name           = isset( $row['name'] ) ? (string) $row['name'] : '';
		$model->json_content   = isset( $row['json_content'] ) ? (string) $row['json_content'] : '';
		$model->html_cache     = isset( $row['html_cache'] ) && null !== $row['html_cache'] ? (string) $row['html_cache'] : null;
		$model->preview_url    = isset( $row['preview_url'] ) && null !== $row['preview_url'] ? (string) $row['preview_url'] : null;
		$model->template_id    = isset( $row['template_id'] ) && null !== $row['template_id'] ? (int) $row['template_id'] : null;
		$model->status         = isset( $row['status'] ) ? (string) $row['status'] : self::STATUS_DRAFT;
		$model->schema_version = isset( $row['schema_version'] ) ? (string) $row['schema_version'] : '1.0';
		$model->created_at     = isset( $row['created_at'] ) ? (string) $row['created_at'] : '';
		$model->updated_at     = isset( $row['updated_at'] ) ? (string) $row['updated_at'] : '';
		return $model;
	}

	/**
	 * @inheritDoc
	 *
	 * `json_content` is decoded so REST clients receive structured JSON
	 * rather than a string-encoded blob. Decoding failures fall back
	 * to an empty array — the field stays present so client code never
	 * has to handle a missing key.
	 */
	public function to_array(): array {
		$decoded = json_decode( $this->json_content, true );

		return [
			'id'             => $this->id,
			'user_id'        => $this->user_id,
			'name'           => $this->name,
			'json_content'   => is_array( $decoded ) ? $decoded : [],
			'html_cache'     => $this->html_cache,
			'preview_url'    => $this->preview_url,
			'template_id'    => $this->template_id,
			'status'         => $this->status,
			'schema_version' => $this->schema_version,
			'created_at'     => $this->created_at,
			'updated_at'     => $this->updated_at,
		];
	}
}
