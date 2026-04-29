<?php
/**
 * Signature model.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Signature extends BaseModel {

	public int $id;
	public int $user_id;
	public string $name;
	/** @var array<string, mixed> */
	public array $json_content;
	public ?string $html_cache;
	public ?string $preview_url;
	public ?int $template_id;
	public string $status;
	public string $schema_version;
	public string $created_at;
	public string $updated_at;

	/**
	 * @param int                  $id             ID.
	 * @param int                  $user_id        Owner.
	 * @param string               $name           Display name.
	 * @param array<string, mixed> $json_content   Signature schema.
	 * @param string|null          $html_cache     Cached compiled HTML.
	 * @param string|null          $preview_url    Preview image URL.
	 * @param int|null             $template_id    Source template, if any.
	 * @param string               $status         Status (`draft`, `ready`, `archived`).
	 * @param string               $schema_version Schema version.
	 * @param string               $created_at     Creation timestamp (UTC).
	 * @param string               $updated_at     Last-update timestamp (UTC).
	 */
	public function __construct(
		int $id,
		int $user_id,
		string $name,
		array $json_content,
		?string $html_cache,
		?string $preview_url,
		?int $template_id,
		string $status,
		string $schema_version,
		string $created_at,
		string $updated_at
	) {
		$this->id             = $id;
		$this->user_id        = $user_id;
		$this->name           = $name;
		$this->json_content   = $json_content;
		$this->html_cache     = $html_cache;
		$this->preview_url    = $preview_url;
		$this->template_id    = $template_id;
		$this->status         = $status;
		$this->schema_version = $schema_version;
		$this->created_at     = $created_at;
		$this->updated_at     = $updated_at;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'id'             => $this->id,
			'user_id'        => $this->user_id,
			'name'           => $this->name,
			'json_content'   => $this->json_content,
			'html_cache'     => $this->html_cache,
			'preview_url'    => $this->preview_url,
			'template_id'    => $this->template_id,
			'status'         => $this->status,
			'schema_version' => $this->schema_version,
			'created_at'     => $this->created_at,
			'updated_at'     => $this->updated_at,
		];
	}

	/**
	 * @param array<string, mixed> $row Row.
	 */
	public static function from_row( array $row ): self {
		$json = isset( $row['json_content'] ) ? json_decode( (string) $row['json_content'], true ) : [];
		return new self(
			(int) ( $row['id'] ?? 0 ),
			(int) ( $row['user_id'] ?? 0 ),
			(string) ( $row['name'] ?? '' ),
			is_array( $json ) ? $json : [],
			isset( $row['html_cache'] ) ? (string) $row['html_cache'] : null,
			isset( $row['preview_url'] ) ? (string) $row['preview_url'] : null,
			isset( $row['template_id'] ) && null !== $row['template_id'] ? (int) $row['template_id'] : null,
			(string) ( $row['status'] ?? 'draft' ),
			(string) ( $row['schema_version'] ?? '1.0' ),
			(string) ( $row['created_at'] ?? '' ),
			(string) ( $row['updated_at'] ?? '' )
		);
	}
}
