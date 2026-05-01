<?php
/**
 * Template repository.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

use ImaginaSignatures\Models\Template;

defined( 'ABSPATH' ) || exit;

/**
 * Data access for `imgsig_templates`.
 *
 * Templates are global (no user scoping). System rows
 * (`is_system = 1`) are seeded by the plugin and protected from
 * deletion by the service layer rather than by the repository.
 *
 * @since 1.0.0
 */
final class TemplateRepository extends BaseRepository {

	/**
	 * Whitelist of orderable columns.
	 *
	 * @var string[]
	 */
	public const ALLOWED_ORDER_BY = [ 'sort_order', 'created_at', 'name' ];

	/**
	 * @inheritDoc
	 */
	protected function table(): string {
		return $this->wpdb->prefix . 'imgsig_templates';
	}

	/**
	 * Fetches by primary key.
	 *
	 * @since 1.0.0
	 *
	 * @param int $id Primary key.
	 *
	 * @return Template|null
	 */
	public function find( int $id ): ?Template {
		$row = $this->wpdb->get_row(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$this->wpdb->prepare( "SELECT * FROM {$this->table()} WHERE id = %d", $id ),
			ARRAY_A
		);
		return is_array( $row ) ? Template::from_row( $row ) : null;
	}

	/**
	 * Fetches by slug.
	 *
	 * @since 1.0.0
	 *
	 * @param string $slug Slug.
	 *
	 * @return Template|null
	 */
	public function find_by_slug( string $slug ): ?Template {
		$row = $this->wpdb->get_row(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$this->wpdb->prepare( "SELECT * FROM {$this->table()} WHERE slug = %s", $slug ),
			ARRAY_A
		);
		return is_array( $row ) ? Template::from_row( $row ) : null;
	}

	/**
	 * Lists templates.
	 *
	 * Supported `$args`:
	 *  - `category` string|null  Filter by category.
	 *  - `page`     int          1-indexed.
	 *  - `per_page` int          Items per page (default 50, max 100).
	 *  - `order_by` string       From {@see ALLOWED_ORDER_BY}.
	 *  - `order`    string       `asc` | `desc` (default `asc`).
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $args Filter / pagination args.
	 *
	 * @return Template[]
	 */
	public function list( array $args = [] ): array {
		[ $where_sql, $where_values ] = $this->build_where( $args );

		$order_by = in_array( (string) ( $args['order_by'] ?? '' ), self::ALLOWED_ORDER_BY, true )
			? (string) $args['order_by']
			: 'sort_order';

		$order    = 'desc' === strtolower( (string) ( $args['order'] ?? 'asc' ) ) ? 'DESC' : 'ASC';
		$per_page = max( 1, min( 100, (int) ( $args['per_page'] ?? 50 ) ) );
		$page     = max( 1, (int) ( $args['page'] ?? 1 ) );
		$offset   = ( $page - 1 ) * $per_page;

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$sql = $this->wpdb->prepare(
			"SELECT * FROM {$this->table()} {$where_sql} ORDER BY {$order_by} {$order} LIMIT %d OFFSET %d",
			...array_merge( $where_values, [ $per_page, $offset ] )
		);

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery
		$rows = $this->wpdb->get_results( $sql, ARRAY_A );

		if ( ! is_array( $rows ) ) {
			return [];
		}

		$out = [];
		foreach ( $rows as $row ) {
			$out[] = Template::from_row( $row );
		}
		return $out;
	}

	/**
	 * Counts templates matching the filters in {@see list()}.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $args Filter args.
	 *
	 * @return int
	 */
	public function count( array $args = [] ): int {
		[ $where_sql, $where_values ] = $this->build_where( $args );

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$count = $this->wpdb->get_var(
			$this->wpdb->prepare(
				"SELECT COUNT(*) FROM {$this->table()} {$where_sql}",
				...$where_values
			)
		);

		return (int) $count;
	}

	/**
	 * Inserts a new template.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $data Field values.
	 *
	 * @return Template
	 */
	public function insert( array $data ): Template {
		$row = [
			'slug'             => (string) ( $data['slug'] ?? '' ),
			'name'             => (string) ( $data['name'] ?? '' ),
			'category'         => (string) ( $data['category'] ?? 'general' ),
			'description'      => $data['description'] ?? null,
			'preview_url'      => $data['preview_url'] ?? null,
			'json_content'     => (string) ( $data['json_content'] ?? '' ),
			'is_system'        => ! empty( $data['is_system'] ) ? 1 : 0,
			'sort_order'       => (int) ( $data['sort_order'] ?? 0 ),
			'schema_version'   => (string) ( $data['schema_version'] ?? '1.0' ),
			'visible_to_roles' => self::roles_to_storage( $data['visible_to_roles'] ?? [] ),
			'created_at'       => $this->now(),
		];

		$this->wpdb->insert(
			$this->table(),
			$row,
			[ '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%s' ]
		);

		$row['id'] = (int) $this->wpdb->insert_id;
		return Template::from_row( $row );
	}

	/**
	 * Updates an existing template.
	 *
	 * @since 1.0.0
	 *
	 * @param int                  $id   Primary key.
	 * @param array<string, mixed> $data Partial field map.
	 *
	 * @return Template|null
	 */
	public function update( int $id, array $data ): ?Template {
		$updatable = [
			'slug'             => '%s',
			'name'             => '%s',
			'category'         => '%s',
			'description'      => '%s',
			'preview_url'      => '%s',
			'json_content'     => '%s',
			'sort_order'       => '%d',
			'schema_version'   => '%s',
			'visible_to_roles' => '%s',
		];

		$update  = [];
		$formats = [];
		foreach ( $updatable as $column => $format ) {
			if ( ! array_key_exists( $column, $data ) ) {
				continue;
			}
			$value = 'visible_to_roles' === $column
				? self::roles_to_storage( $data[ $column ] )
				: $data[ $column ];
			$update[ $column ] = $value;
			$formats[]         = $format;
		}

		if ( empty( $update ) ) {
			return $this->find( $id );
		}

		$this->wpdb->update( $this->table(), $update, [ 'id' => $id ], $formats, [ '%d' ] );
		return $this->find( $id );
	}

	/**
	 * Convert an array of role slugs into the comma-separated string
	 * stored in the DB. Trims, dedupes, drops blanks, and clamps the
	 * total length to fit the column (VARCHAR(500)).
	 *
	 * @since 1.1.0
	 *
	 * @param mixed $roles Raw input.
	 *
	 * @return string
	 */
	private static function roles_to_storage( $roles ): string {
		if ( ! is_array( $roles ) ) {
			return '';
		}
		$clean = [];
		foreach ( $roles as $role ) {
			if ( ! is_string( $role ) ) {
				continue;
			}
			$slug = sanitize_key( $role );
			if ( '' !== $slug && ! in_array( $slug, $clean, true ) ) {
				$clean[] = $slug;
			}
		}
		return substr( implode( ',', $clean ), 0, 500 );
	}

	/**
	 * Deletes by primary key.
	 *
	 * @since 1.0.0
	 *
	 * @param int $id Primary key.
	 *
	 * @return bool
	 */
	public function delete( int $id ): bool {
		$rows = $this->wpdb->delete( $this->table(), [ 'id' => $id ], [ '%d' ] );
		return is_int( $rows ) && $rows > 0;
	}

	/**
	 * Builds the WHERE clause for list/count queries.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $args Filter args.
	 *
	 * @return array{0: string, 1: array<int, mixed>}
	 */
	private function build_where( array $args ): array {
		$clauses = [];
		$values  = [];

		if ( ! empty( $args['category'] ) ) {
			$clauses[] = 'category = %s';
			$values[]  = (string) $args['category'];
		}

		// Visibility filter: when given, returns only templates whose
		// visible_to_roles is empty (visible to everyone) OR contains
		// at least one of the supplied roles. Implemented with FIND_IN_SET
		// so the comma-separated storage stays a single column query.
		if ( ! empty( $args['visible_to_roles'] ) && is_array( $args['visible_to_roles'] ) ) {
			$role_clauses = [ '(visible_to_roles IS NULL OR visible_to_roles = %s)' ];
			$values[]     = '';
			foreach ( $args['visible_to_roles'] as $role ) {
				if ( ! is_string( $role ) || '' === $role ) {
					continue;
				}
				$role_clauses[] = 'FIND_IN_SET(%s, visible_to_roles) > 0';
				$values[]       = sanitize_key( $role );
			}
			$clauses[] = '(' . implode( ' OR ', $role_clauses ) . ')';
		}

		if ( empty( $clauses ) ) {
			return [ '', [] ];
		}

		return [ 'WHERE ' . implode( ' AND ', $clauses ), $values ];
	}
}
