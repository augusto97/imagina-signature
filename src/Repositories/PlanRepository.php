<?php
/**
 * Repository for the `plans` table.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

use ImaginaSignatures\Models\Plan;
use ImaginaSignatures\Models\PlanLimits;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CRUD access to plans.
 *
 * @since 1.0.0
 */
final class PlanRepository extends BaseRepository {

	protected function table(): string {
		return $this->db()->prefix . 'imgsig_plans';
	}

	/**
	 * Returns every active plan ordered by sort.
	 *
	 * @param bool $include_inactive Include inactive plans.
	 *
	 * @return Plan[]
	 */
	public function find_all( bool $include_inactive = false ): array {
		$where = $include_inactive ? '1=1' : 'is_active = 1';
		$rows  = $this->db()->get_results(
			'SELECT * FROM ' . $this->table() . ' WHERE ' . $where . ' ORDER BY sort_order ASC, name ASC',
			ARRAY_A
		);
		return array_map( static fn( array $row ) => Plan::from_row( $row ), is_array( $rows ) ? $rows : [] );
	}

	/**
	 * Finds a plan by id.
	 *
	 * @param int $id Plan id.
	 *
	 * @return Plan|null
	 */
	public function find( int $id ): ?Plan {
		$row = $this->db()->get_row(
			$this->db()->prepare( 'SELECT * FROM ' . $this->table() . ' WHERE id = %d', $id ),
			ARRAY_A
		);
		return is_array( $row ) ? Plan::from_row( $row ) : null;
	}

	/**
	 * Finds a plan by slug.
	 *
	 * @param string $slug Slug.
	 *
	 * @return Plan|null
	 */
	public function find_by_slug( string $slug ): ?Plan {
		$row = $this->db()->get_row(
			$this->db()->prepare( 'SELECT * FROM ' . $this->table() . ' WHERE slug = %s', $slug ),
			ARRAY_A
		);
		return is_array( $row ) ? Plan::from_row( $row ) : null;
	}

	/**
	 * Returns the default plan or null if none is configured.
	 *
	 * @return Plan|null
	 */
	public function get_default(): ?Plan {
		$row = $this->db()->get_row(
			'SELECT * FROM ' . $this->table() . ' WHERE is_default = 1 AND is_active = 1 LIMIT 1',
			ARRAY_A
		);
		return is_array( $row ) ? Plan::from_row( $row ) : null;
	}

	/**
	 * Inserts or updates a plan (by slug).
	 *
	 * @param array<string, mixed> $data Plan fields.
	 *
	 * @return int Plan id.
	 */
	public function upsert( array $data ): int {
		$existing = isset( $data['slug'] ) ? $this->find_by_slug( (string) $data['slug'] ) : null;

		$limits = $data['limits'] instanceof PlanLimits
			? $data['limits']
			: PlanLimits::from_array( is_array( $data['limits'] ?? null ) ? $data['limits'] : [] );

		$record = [
			'slug'        => (string) ( $data['slug'] ?? '' ),
			'name'        => (string) ( $data['name'] ?? '' ),
			'description' => isset( $data['description'] ) ? (string) $data['description'] : null,
			'limits_json' => (string) wp_json_encode( $limits->to_array() ),
			'is_default'  => ! empty( $data['is_default'] ) ? 1 : 0,
			'is_active'   => ! isset( $data['is_active'] ) || ! empty( $data['is_active'] ) ? 1 : 0,
			'sort_order'  => (int) ( $data['sort_order'] ?? 0 ),
			'updated_at'  => $this->now(),
		];

		if ( null === $existing ) {
			$record['created_at'] = $this->now();
			$this->db()->insert( $this->table(), $record );
			$id = (int) $this->db()->insert_id;
		} else {
			$this->db()->update( $this->table(), $record, [ 'id' => $existing->id ] );
			$id = $existing->id;
		}

		if ( ! empty( $record['is_default'] ) ) {
			$this->db()->query(
				$this->db()->prepare(
					'UPDATE ' . $this->table() . ' SET is_default = 0 WHERE id <> %d',
					$id
				)
			);
			update_option( 'imgsig_default_plan_id', $id, false );
		}

		return $id;
	}

	/**
	 * Deletes a plan.
	 *
	 * @param int $id Plan id.
	 *
	 * @return bool
	 */
	public function delete( int $id ): bool {
		return (bool) $this->db()->delete( $this->table(), [ 'id' => $id ], [ '%d' ] );
	}
}
