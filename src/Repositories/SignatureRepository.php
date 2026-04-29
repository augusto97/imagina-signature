<?php
/**
 * Repository for the `signatures` table.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

use ImaginaSignatures\Models\Signature;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CRUD access to signatures.
 *
 * @since 1.0.0
 */
final class SignatureRepository extends BaseRepository {

	/**
	 * {@inheritDoc}
	 */
	protected function table(): string {
		return $this->db()->prefix . 'imgsig_signatures';
	}

	/**
	 * Finds a signature by id.
	 *
	 * @param int $id Signature id.
	 *
	 * @return Signature|null
	 */
	public function find( int $id ): ?Signature {
		$row = $this->db()->get_row(
			$this->db()->prepare( 'SELECT * FROM ' . $this->table() . ' WHERE id = %d', $id ),
			ARRAY_A
		);
		return is_array( $row ) ? Signature::from_row( $row ) : null;
	}

	/**
	 * Lists signatures owned by a user.
	 *
	 * @param int                  $user_id User id.
	 * @param array<string, mixed> $args    Filters: status, search, page, per_page, orderby, order.
	 *
	 * @return array{items: Signature[], total: int}
	 */
	public function find_by_user( int $user_id, array $args = [] ): array {
		$status   = isset( $args['status'] ) ? (string) $args['status'] : '';
		$search   = isset( $args['search'] ) ? (string) $args['search'] : '';
		$per_page = max( 1, min( 100, (int) ( $args['per_page'] ?? 20 ) ) );
		$page     = max( 1, (int) ( $args['page'] ?? 1 ) );
		$offset   = ( $page - 1 ) * $per_page;

		$orderby_allowed = [ 'updated_at', 'created_at', 'name' ];
		$orderby         = in_array( (string) ( $args['orderby'] ?? 'updated_at' ), $orderby_allowed, true )
			? (string) $args['orderby']
			: 'updated_at';
		$order = strtoupper( (string) ( $args['order'] ?? 'desc' ) ) === 'ASC' ? 'ASC' : 'DESC';

		$where  = 'WHERE user_id = %d';
		$params = [ $user_id ];
		if ( '' !== $status ) {
			$where   .= ' AND status = %s';
			$params[] = $status;
		}
		if ( '' !== $search ) {
			$where   .= ' AND name LIKE %s';
			$params[] = '%' . $this->db()->esc_like( $search ) . '%';
		}

		$total_sql = 'SELECT COUNT(*) FROM ' . $this->table() . ' ' . $where;
		$total     = (int) $this->db()->get_var( $this->db()->prepare( $total_sql, ...$params ) );

		$list_sql = 'SELECT * FROM ' . $this->table() . ' ' . $where
			. ' ORDER BY ' . $orderby . ' ' . $order
			. ' LIMIT %d OFFSET %d';
		$params[] = $per_page;
		$params[] = $offset;

		$rows = $this->db()->get_results( $this->db()->prepare( $list_sql, ...$params ), ARRAY_A );

		$items = array_map(
			static fn( array $row ) => Signature::from_row( $row ),
			is_array( $rows ) ? $rows : []
		);

		return [
			'items' => $items,
			'total' => $total,
		];
	}

	/**
	 * Counts signatures for a user.
	 *
	 * @param int $user_id User id.
	 *
	 * @return int
	 */
	public function count_by_user( int $user_id ): int {
		return (int) $this->db()->get_var(
			$this->db()->prepare(
				'SELECT COUNT(*) FROM ' . $this->table() . ' WHERE user_id = %d',
				$user_id
			)
		);
	}

	/**
	 * Creates a signature.
	 *
	 * @param int                  $user_id      Owner.
	 * @param string               $name         Name.
	 * @param array<string, mixed> $json_content JSON schema.
	 * @param int|null             $template_id  Optional template.
	 *
	 * @return int Inserted id.
	 */
	public function create( int $user_id, string $name, array $json_content, ?int $template_id = null ): int {
		$now = $this->now();
		$this->db()->insert(
			$this->table(),
			[
				'user_id'        => $user_id,
				'name'           => $name,
				'json_content'   => (string) wp_json_encode( $json_content ),
				'template_id'    => $template_id,
				'status'         => 'draft',
				'schema_version' => '1.0',
				'created_at'     => $now,
				'updated_at'     => $now,
			],
			[ '%d', '%s', '%s', '%d', '%s', '%s', '%s', '%s' ]
		);
		return (int) $this->db()->insert_id;
	}

	/**
	 * Updates a signature.
	 *
	 * @param int                  $id      Signature id.
	 * @param array<string, mixed> $changes Changes (subset of: name, json_content, html_cache, preview_url, status).
	 *
	 * @return bool Whether the update affected a row.
	 */
	public function update( int $id, array $changes ): bool {
		$update = [ 'updated_at' => $this->now() ];
		$format = [ '%s' ];

		if ( isset( $changes['name'] ) ) {
			$update['name'] = (string) $changes['name'];
			$format[]       = '%s';
		}
		if ( isset( $changes['json_content'] ) ) {
			$update['json_content'] = (string) wp_json_encode( $changes['json_content'] );
			$format[]               = '%s';
		}
		if ( array_key_exists( 'html_cache', $changes ) ) {
			$update['html_cache'] = $changes['html_cache'] === null ? null : (string) $changes['html_cache'];
			$format[]             = '%s';
		}
		if ( array_key_exists( 'preview_url', $changes ) ) {
			$update['preview_url'] = $changes['preview_url'] === null ? null : (string) $changes['preview_url'];
			$format[]              = '%s';
		}
		if ( isset( $changes['status'] ) ) {
			$update['status'] = (string) $changes['status'];
			$format[]         = '%s';
		}

		$rows = $this->db()->update( $this->table(), $update, [ 'id' => $id ], $format, [ '%d' ] );
		return $rows !== false;
	}

	/**
	 * Deletes a signature.
	 *
	 * @param int $id Signature id.
	 *
	 * @return bool
	 */
	public function delete( int $id ): bool {
		return (bool) $this->db()->delete( $this->table(), [ 'id' => $id ], [ '%d' ] );
	}
}
