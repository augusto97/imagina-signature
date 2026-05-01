<?php
/**
 * Signature repository.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

use ImaginaSignatures\Models\Signature;

defined( 'ABSPATH' ) || exit;

/**
 * Data access for `imgsig_signatures`.
 *
 * Methods that fetch by user ID enforce ownership at the SQL level —
 * REST controllers always go through `find_owned_by()` so a malicious
 * `id` parameter can't surface another user's row.
 *
 * Sorting is hard-coded to a small allow-list to keep injection
 * surfaces minimal; clients pick from {@see ALLOWED_ORDER_BY}.
 *
 * Not declared `final` so PHPUnit 9 can produce mock doubles for
 * controller integration tests.
 *
 * @since 1.0.0
 */
class SignatureRepository extends BaseRepository {

	/**
	 * Whitelist of orderable columns.
	 *
	 * @var string[]
	 */
	public const ALLOWED_ORDER_BY = [ 'updated_at', 'created_at', 'name' ];

	/**
	 * @inheritDoc
	 */
	protected function table(): string {
		return $this->wpdb->prefix . 'imgsig_signatures';
	}

	/**
	 * Fetches by primary key.
	 *
	 * @since 1.0.0
	 *
	 * @param int $id Primary key.
	 *
	 * @return Signature|null
	 */
	public function find( int $id ): ?Signature {
		$row = $this->wpdb->get_row(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$this->wpdb->prepare( "SELECT * FROM {$this->table()} WHERE id = %d", $id ),
			ARRAY_A
		);

		return is_array( $row ) ? Signature::from_row( $row ) : null;
	}

	/**
	 * Fetches when the row is owned by the given user.
	 *
	 * Always prefer this over {@see find()} from REST controllers — it
	 * folds the ownership check into the query, eliminating a TOCTOU
	 * window between fetch and check.
	 *
	 * @since 1.0.0
	 *
	 * @param int $signature_id Primary key.
	 * @param int $user_id      Owner's user ID.
	 *
	 * @return Signature|null
	 */
	public function find_owned_by( int $signature_id, int $user_id ): ?Signature {
		$row = $this->wpdb->get_row(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$this->wpdb->prepare(
				"SELECT * FROM {$this->table()} WHERE id = %d AND user_id = %d",
				$signature_id,
				$user_id
			),
			ARRAY_A
		);

		return is_array( $row ) ? Signature::from_row( $row ) : null;
	}

	/**
	 * Returns true when the user already has at least one signature
	 * row stamped with the given template_id. Used by the bulk-apply
	 * flow to skip rows that would otherwise duplicate.
	 *
	 * @since 1.1.0
	 *
	 * @param int $user_id     Owner.
	 * @param int $template_id The template the signature was seeded from.
	 *
	 * @return bool
	 */
	public function user_has_signature_from_template( int $user_id, int $template_id ): bool {
		$count = $this->wpdb->get_var(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$this->wpdb->prepare(
				"SELECT COUNT(*) FROM {$this->table()} WHERE user_id = %d AND template_id = %d",
				$user_id,
				$template_id
			)
		);
		return (int) $count > 0;
	}

	/**
	 * Lists signatures owned by the given user.
	 *
	 * Supported `$args`:
	 *  - `status`   string|null  Filter by status.
	 *  - `search`   string|null  Case-insensitive partial match on name.
	 *  - `page`     int          1-indexed page (default 1).
	 *  - `per_page` int          Items per page (default 20, max 100).
	 *  - `order_by` string       Column from {@see ALLOWED_ORDER_BY}.
	 *  - `order`    string       `asc` | `desc` (default `desc`).
	 *
	 * @since 1.0.0
	 *
	 * @param int                  $user_id Owner.
	 * @param array<string, mixed> $args    Filter/pagination args.
	 *
	 * @return Signature[]
	 */
	public function find_by_user( int $user_id, array $args = [] ): array {
		[ $where_sql, $where_values ] = $this->build_where( $user_id, $args );

		$order_by = in_array( (string) ( $args['order_by'] ?? '' ), self::ALLOWED_ORDER_BY, true )
			? (string) $args['order_by']
			: 'updated_at';

		$order    = 'asc' === strtolower( (string) ( $args['order'] ?? 'desc' ) ) ? 'ASC' : 'DESC';
		$per_page = max( 1, min( 100, (int) ( $args['per_page'] ?? 20 ) ) );
		$page     = max( 1, (int) ( $args['page'] ?? 1 ) );
		$offset   = ( $page - 1 ) * $per_page;

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$sql = $this->wpdb->prepare(
			"SELECT * FROM {$this->table()} WHERE {$where_sql} ORDER BY {$order_by} {$order} LIMIT %d OFFSET %d",
			...array_merge( $where_values, [ $per_page, $offset ] )
		);

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery
		$rows = $this->wpdb->get_results( $sql, ARRAY_A );

		if ( ! is_array( $rows ) ) {
			return [];
		}

		$out = [];
		foreach ( $rows as $row ) {
			$out[] = Signature::from_row( $row );
		}
		return $out;
	}

	/**
	 * Counts signatures matching the same filter set as
	 * {@see find_by_user()}.
	 *
	 * @since 1.0.0
	 *
	 * @param int                  $user_id Owner.
	 * @param array<string, mixed> $args    Filter args.
	 *
	 * @return int
	 */
	public function count_by_user( int $user_id, array $args = [] ): int {
		[ $where_sql, $where_values ] = $this->build_where( $user_id, $args );

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$count = $this->wpdb->get_var(
			$this->wpdb->prepare(
				"SELECT COUNT(*) FROM {$this->table()} WHERE {$where_sql}",
				...$where_values
			)
		);

		return (int) $count;
	}

	/**
	 * Inserts a new signature row.
	 *
	 * `$data` must include `user_id`, `name`, `json_content`. Other
	 * fields fall back to defaults defined here.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $data Field values.
	 *
	 * @return Signature
	 */
	public function insert( array $data ): Signature {
		$now = $this->now();

		$row = [
			'user_id'        => (int) ( $data['user_id'] ?? 0 ),
			'name'           => (string) ( $data['name'] ?? '' ),
			'json_content'   => (string) ( $data['json_content'] ?? '' ),
			'html_cache'     => $data['html_cache'] ?? null,
			'preview_url'    => $data['preview_url'] ?? null,
			'template_id'    => isset( $data['template_id'] ) ? (int) $data['template_id'] : null,
			'status'         => (string) ( $data['status'] ?? Signature::STATUS_DRAFT ),
			'schema_version' => (string) ( $data['schema_version'] ?? '1.0' ),
			'created_at'     => $now,
			'updated_at'     => $now,
		];

		$this->wpdb->insert(
			$this->table(),
			$row,
			[ '%d', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s' ]
		);

		$row['id'] = (int) $this->wpdb->insert_id;
		return Signature::from_row( $row );
	}

	/**
	 * Updates an existing signature row.
	 *
	 * Only fields present in `$data` are written; everything else stays
	 * untouched. `updated_at` is bumped automatically.
	 *
	 * @since 1.0.0
	 *
	 * @param int                  $id   Primary key.
	 * @param array<string, mixed> $data Partial field map.
	 *
	 * @return Signature|null  The updated row, or null when no row matched.
	 */
	public function update( int $id, array $data ): ?Signature {
		$updatable = [
			'name'           => '%s',
			'json_content'   => '%s',
			'html_cache'     => '%s',
			'preview_url'    => '%s',
			'template_id'    => '%d',
			'status'         => '%s',
			'schema_version' => '%s',
		];

		$update  = [];
		$formats = [];
		foreach ( $updatable as $column => $format ) {
			if ( array_key_exists( $column, $data ) ) {
				$update[ $column ] = $data[ $column ];
				$formats[]         = $format;
			}
		}

		if ( empty( $update ) ) {
			return $this->find( $id );
		}

		$update['updated_at'] = $this->now();
		$formats[]            = '%s';

		$this->wpdb->update( $this->table(), $update, [ 'id' => $id ], $formats, [ '%d' ] );

		return $this->find( $id );
	}

	/**
	 * Deletes a row by primary key.
	 *
	 * @since 1.0.0
	 *
	 * @param int $id Primary key.
	 *
	 * @return bool True when at least one row was deleted.
	 */
	public function delete( int $id ): bool {
		$rows = $this->wpdb->delete( $this->table(), [ 'id' => $id ], [ '%d' ] );
		return is_int( $rows ) && $rows > 0;
	}

	/**
	 * Builds the WHERE clause and bound values for list/count queries.
	 *
	 * @since 1.0.0
	 *
	 * @param int                  $user_id Owner.
	 * @param array<string, mixed> $args    Filter args.
	 *
	 * @return array{0: string, 1: array<int, mixed>}
	 */
	private function build_where( int $user_id, array $args ): array {
		$clauses = [ 'user_id = %d' ];
		$values  = [ $user_id ];

		if ( ! empty( $args['status'] ) && in_array( (string) $args['status'], Signature::STATUSES, true ) ) {
			$clauses[] = 'status = %s';
			$values[]  = (string) $args['status'];
		}

		if ( ! empty( $args['search'] ) ) {
			$clauses[] = 'name LIKE %s';
			$values[]  = '%' . $this->wpdb->esc_like( (string) $args['search'] ) . '%';
		}

		return [ implode( ' AND ', $clauses ), $values ];
	}
}
