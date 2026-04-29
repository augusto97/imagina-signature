<?php
/**
 * Template model.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Template extends BaseModel {

	public int $id;
	public string $slug;
	public string $name;
	public string $category;
	public ?string $description;
	public ?string $preview_url;
	/** @var array<string, mixed> */
	public array $json_content;
	public bool $is_premium;
	public bool $is_system;
	public int $sort_order;
	public string $schema_version;
	public string $created_at;

	/**
	 * @param int                  $id             ID.
	 * @param string               $slug           Slug.
	 * @param string               $name           Display name.
	 * @param string               $category       Category.
	 * @param string|null          $description    Description.
	 * @param string|null          $preview_url    Preview URL.
	 * @param array<string, mixed> $json_content   Schema content.
	 * @param bool                 $is_premium     Whether the template is premium.
	 * @param bool                 $is_system      Whether the template ships with the plugin.
	 * @param int                  $sort_order     Sort order.
	 * @param string               $schema_version Schema version.
	 * @param string               $created_at     Created timestamp.
	 */
	public function __construct(
		int $id,
		string $slug,
		string $name,
		string $category,
		?string $description,
		?string $preview_url,
		array $json_content,
		bool $is_premium,
		bool $is_system,
		int $sort_order,
		string $schema_version,
		string $created_at
	) {
		$this->id             = $id;
		$this->slug           = $slug;
		$this->name           = $name;
		$this->category       = $category;
		$this->description    = $description;
		$this->preview_url    = $preview_url;
		$this->json_content   = $json_content;
		$this->is_premium     = $is_premium;
		$this->is_system      = $is_system;
		$this->sort_order     = $sort_order;
		$this->schema_version = $schema_version;
		$this->created_at     = $created_at;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'id'             => $this->id,
			'slug'           => $this->slug,
			'name'           => $this->name,
			'category'       => $this->category,
			'description'    => $this->description,
			'preview_url'    => $this->preview_url,
			'json_content'   => $this->json_content,
			'is_premium'     => $this->is_premium,
			'is_system'      => $this->is_system,
			'sort_order'     => $this->sort_order,
			'schema_version' => $this->schema_version,
			'created_at'     => $this->created_at,
		];
	}

	/**
	 * @param array<string, mixed> $row Row.
	 */
	public static function from_row( array $row ): self {
		$json = isset( $row['json_content'] ) ? json_decode( (string) $row['json_content'], true ) : [];
		return new self(
			(int) ( $row['id'] ?? 0 ),
			(string) ( $row['slug'] ?? '' ),
			(string) ( $row['name'] ?? '' ),
			(string) ( $row['category'] ?? 'general' ),
			isset( $row['description'] ) ? (string) $row['description'] : null,
			isset( $row['preview_url'] ) ? (string) $row['preview_url'] : null,
			is_array( $json ) ? $json : [],
			! empty( $row['is_premium'] ),
			! empty( $row['is_system'] ),
			(int) ( $row['sort_order'] ?? 0 ),
			(string) ( $row['schema_version'] ?? '1.0' ),
			(string) ( $row['created_at'] ?? '' )
		);
	}
}
