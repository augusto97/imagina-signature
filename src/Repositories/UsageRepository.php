<?php
/**
 * Repository for the cached usage table.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

use ImaginaSignatures\Models\UsageRecord;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class UsageRepository extends BaseRepository {

	protected function table(): string {
		return $this->db()->prefix . 'imgsig_usage';
	}

	/**
	 * Returns usage for a user (zero record if absent).
	 *
	 * @param int $user_id User id.
	 *
	 * @return UsageRecord
	 */
	public function get_for_user( int $user_id ): UsageRecord {
		$row = $this->db()->get_row(
			$this->db()->prepare( 'SELECT * FROM ' . $this->table() . ' WHERE user_id = %d', $user_id ),
			ARRAY_A
		);
		if ( is_array( $row ) ) {
			return UsageRecord::from_row( $row );
		}
		return new UsageRecord( $user_id );
	}

	/**
	 * Atomically updates the cached counters.
	 *
	 * @param int $user_id           User id.
	 * @param int $signature_delta   Delta for `signatures_count`.
	 * @param int $storage_delta     Delta for `storage_bytes`.
	 *
	 * @return void
	 */
	public function adjust( int $user_id, int $signature_delta, int $storage_delta ): void {
		$existing = $this->get_for_user( $user_id );
		$count    = max( 0, $existing->signatures_count + $signature_delta );
		$bytes    = max( 0, $existing->storage_bytes + $storage_delta );
		$now      = $this->now();

		$this->db()->query(
			$this->db()->prepare(
				'INSERT INTO ' . $this->table() . ' (user_id, signatures_count, storage_bytes, last_activity_at, updated_at)
				 VALUES (%d, %d, %d, %s, %s)
				 ON DUPLICATE KEY UPDATE signatures_count = VALUES(signatures_count),
				   storage_bytes = VALUES(storage_bytes),
				   last_activity_at = VALUES(last_activity_at),
				   updated_at = VALUES(updated_at)',
				$user_id,
				$count,
				$bytes,
				$now,
				$now
			)
		);
	}

	/**
	 * Recomputes usage from scratch from the source tables.
	 *
	 * @param int $user_id User id.
	 *
	 * @return UsageRecord
	 */
	public function recompute( int $user_id ): UsageRecord {
		$signatures_table = $this->db()->prefix . 'imgsig_signatures';
		$assets_table     = $this->db()->prefix . 'imgsig_assets';

		$signatures = (int) $this->db()->get_var(
			$this->db()->prepare( 'SELECT COUNT(*) FROM ' . $signatures_table . ' WHERE user_id = %d', $user_id )
		);

		$bytes = 0;
		// `assets` table is created in a later sprint; check existence first.
		$assets_exists = (bool) $this->db()->get_var(
			$this->db()->prepare( 'SHOW TABLES LIKE %s', $assets_table )
		);
		if ( $assets_exists ) {
			$bytes = (int) $this->db()->get_var(
				$this->db()->prepare( 'SELECT COALESCE(SUM(size_bytes), 0) FROM ' . $assets_table . ' WHERE user_id = %d', $user_id )
			);
		}

		$now = $this->now();
		$this->db()->query(
			$this->db()->prepare(
				'INSERT INTO ' . $this->table() . ' (user_id, signatures_count, storage_bytes, last_activity_at, updated_at)
				 VALUES (%d, %d, %d, %s, %s)
				 ON DUPLICATE KEY UPDATE signatures_count = VALUES(signatures_count),
				   storage_bytes = VALUES(storage_bytes),
				   last_activity_at = VALUES(last_activity_at),
				   updated_at = VALUES(updated_at)',
				$user_id,
				$signatures,
				$bytes,
				$now,
				$now
			)
		);

		return new UsageRecord( $user_id, $signatures, $bytes, $now, $now );
	}
}
