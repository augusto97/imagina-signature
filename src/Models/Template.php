<?php
/**
 * Template model.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

defined( 'ABSPATH' ) || exit;

/**
 * One row of `imgsig_templates` (CLAUDE.md §7.1).
 *
 * Templates are global — `is_system=1` rows are seeded on activation
 * and protected from deletion via the {@see TemplateService} layer.
 *
 * @since 1.0.0
 */
final class Template extends BaseModel {

	/**
	 * Slug (unique, used for stable references from default-template seeds).
	 *
	 * @var string
	 */
	public string $slug = '';

	/**
	 * Display name.
	 *
	 * @var string
	 */
	public string $name = '';

	/**
	 * Free-form category label (e.g. `corporate`, `creative`).
	 *
	 * @var string
	 */
	public string $category = 'general';

	/**
	 * Optional long-form description.
	 *
	 * @var string|null
	 */
	public ?string $description = null;

	/**
	 * Optional preview image URL.
	 *
	 * @var string|null
	 */
	public ?string $preview_url = null;

	/**
	 * JSON-encoded signature schema (LONGTEXT in the DB).
	 *
	 * @var string
	 */
	public string $json_content = '';

	/**
	 * Whether this row was seeded by the plugin and must NOT be deletable
	 * by users.
	 *
	 * @var bool
	 */
	public bool $is_system = false;

	/**
	 * Sort weight for the picker UI (lower first).
	 *
	 * @var int
	 */
	public int $sort_order = 0;

	/**
	 * Schema version this row was written with.
	 *
	 * @var string
	 */
	public string $schema_version = '1.0';

	/**
	 * WP role slugs this template is visible to. Empty array = visible
	 * to everyone with `imgsig_use_signatures`. Stored in the DB as a
	 * comma-separated VARCHAR(500), exposed to PHP as a typed array.
	 *
	 * @var array<int, string>
	 */
	public array $visible_to_roles = [];

	/**
	 * Hydrates from a DB row.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $row DB row.
	 *
	 * @return self
	 */
	public static function from_row( array $row ): self {
		$model                 = new self();
		$model->id             = isset( $row['id'] ) ? (int) $row['id'] : 0;
		$model->slug           = isset( $row['slug'] ) ? (string) $row['slug'] : '';
		$model->name           = isset( $row['name'] ) ? (string) $row['name'] : '';
		$model->category       = isset( $row['category'] ) ? (string) $row['category'] : 'general';
		$model->description    = isset( $row['description'] ) && null !== $row['description'] ? (string) $row['description'] : null;
		$model->preview_url    = isset( $row['preview_url'] ) && null !== $row['preview_url'] ? (string) $row['preview_url'] : null;
		$model->json_content   = isset( $row['json_content'] ) ? (string) $row['json_content'] : '';
		$model->is_system      = ! empty( $row['is_system'] );
		$model->sort_order     = isset( $row['sort_order'] ) ? (int) $row['sort_order'] : 0;
		$model->schema_version = isset( $row['schema_version'] ) ? (string) $row['schema_version'] : '1.0';
		$model->visible_to_roles = isset( $row['visible_to_roles'] ) && '' !== (string) $row['visible_to_roles']
			? array_values( array_filter( array_map( 'trim', explode( ',', (string) $row['visible_to_roles'] ) ) ) )
			: [];
		$model->created_at     = isset( $row['created_at'] ) ? (string) $row['created_at'] : '';
		return $model;
	}

	/**
	 * @inheritDoc
	 */
	public function to_array(): array {
		$decoded = json_decode( $this->json_content, true );

		return [
			'id'               => $this->id,
			'slug'             => $this->slug,
			'name'             => $this->name,
			'category'         => $this->category,
			'description'      => $this->description,
			'preview_url'      => $this->preview_url,
			'json_content'     => is_array( $decoded ) ? $decoded : [],
			'is_system'        => $this->is_system,
			'sort_order'       => $this->sort_order,
			'schema_version'   => $this->schema_version,
			'visible_to_roles' => $this->visible_to_roles,
			'created_at'       => $this->created_at,
		];
	}
}
