<?php
/**
 * Repository for the user→plan pivot table.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

use ImaginaSignatures\Models\UserPlan;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class UserPlanRepository extends BaseRepository {

	protected function table(): string {
		return $this->db()->prefix . 'imgsig_user_plans';
	}

	/**
	 * Finds the assignment for a user.
	 *
	 * @param int $user_id User id.
	 *
	 * @return UserPlan|null
	 */
	public function find_for_user( int $user_id ): ?UserPlan {
		$row = $this->db()->get_row(
			$this->db()->prepare( 'SELECT * FROM ' . $this->table() . ' WHERE user_id = %d', $user_id ),
			ARRAY_A
		);
		return is_array( $row ) ? UserPlan::from_row( $row ) : null;
	}

	/**
	 * Assigns a plan to a user (replaces any prior assignment).
	 *
	 * @param int                  $user_id    User id.
	 * @param int                  $plan_id    Plan id.
	 * @param string|null          $expires_at Optional expiration timestamp.
	 * @param array<string, mixed> $metadata   Free-form metadata.
	 *
	 * @return void
	 */
	public function assign( int $user_id, int $plan_id, ?string $expires_at = null, array $metadata = [] ): void {
		$now    = $this->now();
		$record = [
			'user_id'     => $user_id,
			'plan_id'     => $plan_id,
			'assigned_at' => $now,
			'expires_at'  => $expires_at,
			'metadata'    => (string) wp_json_encode( $metadata ),
		];

		$existing = $this->find_for_user( $user_id );
		if ( null === $existing ) {
			$this->db()->insert( $this->table(), $record );
		} else {
			$this->db()->update( $this->table(), $record, [ 'user_id' => $user_id ] );
		}
	}

	/**
	 * Removes the assignment for a user.
	 *
	 * @param int $user_id User id.
	 *
	 * @return void
	 */
	public function detach( int $user_id ): void {
		$this->db()->delete( $this->table(), [ 'user_id' => $user_id ], [ '%d' ] );
	}

	/**
	 * Counts assignments for a plan.
	 *
	 * @param int $plan_id Plan id.
	 *
	 * @return int
	 */
	public function count_by_plan( int $plan_id ): int {
		return (int) $this->db()->get_var(
			$this->db()->prepare(
				'SELECT COUNT(*) FROM ' . $this->table() . ' WHERE plan_id = %d',
				$plan_id
			)
		);
	}
}
