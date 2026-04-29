<?php
/**
 * Repository for the `templates` table.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

use ImaginaSignatures\Models\Template;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CRUD access to templates.
 *
 * @since 1.0.0
 */
final class TemplateRepository extends BaseRepository {

	protected function table(): string {
		return $this->db()->prefix . 'imgsig_templates';
	}

	/**
	 * Lists templates filtered by category and premium flag.
	 *
	 * @param array<string, mixed> $args Filters.
	 *
	 * @return Template[]
	 */
	public function find_all( array $args = [] ): array {
		$where  = '1=1';
		$params = [];
		if ( isset( $args['category'] ) && '' !== $args['category'] ) {
			$where   .= ' AND category = %s';
			$params[] = (string) $args['category'];
		}
		if ( isset( $args['premium'] ) ) {
			$where   .= ' AND is_premium = %d';
			$params[] = (int) (bool) $args['premium'];
		}

		$sql = 'SELECT * FROM ' . $this->table() . ' WHERE ' . $where . ' ORDER BY sort_order ASC, name ASC';
		if ( ! empty( $params ) ) {
			$sql = $this->db()->prepare( $sql, ...$params );
		}

		$rows = $this->db()->get_results( $sql, ARRAY_A );
		return array_map( static fn( array $row ) => Template::from_row( $row ), is_array( $rows ) ? $rows : [] );
	}

	/**
	 * Finds a template by id.
	 *
	 * @param int $id Template id.
	 *
	 * @return Template|null
	 */
	public function find( int $id ): ?Template {
		$row = $this->db()->get_row(
			$this->db()->prepare( 'SELECT * FROM ' . $this->table() . ' WHERE id = %d', $id ),
			ARRAY_A
		);
		return is_array( $row ) ? Template::from_row( $row ) : null;
	}

	/**
	 * Finds a template by slug.
	 *
	 * @param string $slug Slug.
	 *
	 * @return Template|null
	 */
	public function find_by_slug( string $slug ): ?Template {
		$row = $this->db()->get_row(
			$this->db()->prepare( 'SELECT * FROM ' . $this->table() . ' WHERE slug = %s', $slug ),
			ARRAY_A
		);
		return is_array( $row ) ? Template::from_row( $row ) : null;
	}

	/**
	 * Inserts or updates a template (idempotent by slug).
	 *
	 * @param array<string, mixed> $data Template fields.
	 *
	 * @return int Affected id.
	 */
	public function upsert( array $data ): int {
		$existing = isset( $data['slug'] ) ? $this->find_by_slug( (string) $data['slug'] ) : null;

		$record = [
			'slug'           => (string) ( $data['slug'] ?? '' ),
			'name'           => (string) ( $data['name'] ?? '' ),
			'category'       => (string) ( $data['category'] ?? 'general' ),
			'description'    => isset( $data['description'] ) ? (string) $data['description'] : null,
			'preview_url'    => isset( $data['preview_url'] ) ? (string) $data['preview_url'] : null,
			'json_content'   => (string) wp_json_encode( $data['json_content'] ?? new \stdClass() ),
			'is_premium'     => ! empty( $data['is_premium'] ) ? 1 : 0,
			'is_system'      => ! empty( $data['is_system'] ) ? 1 : 0,
			'sort_order'     => (int) ( $data['sort_order'] ?? 0 ),
			'schema_version' => (string) ( $data['schema_version'] ?? '1.0' ),
		];

		if ( null === $existing ) {
			$record['created_at'] = $this->now();
			$this->db()->insert( $this->table(), $record );
			return (int) $this->db()->insert_id;
		}

		$this->db()->update( $this->table(), $record, [ 'id' => $existing->id ] );
		return $existing->id;
	}

	/**
	 * Deletes a template.
	 *
	 * @param int $id Template id.
	 *
	 * @return bool
	 */
	public function delete( int $id ): bool {
		return (bool) $this->db()->delete( $this->table(), [ 'id' => $id ], [ '%d' ] );
	}
}
