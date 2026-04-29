<?php
/**
 * Plan management service.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Models\Plan;
use ImaginaSignatures\Repositories\PlanRepository;
use ImaginaSignatures\Repositories\UserPlanRepository;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Owns the lifecycle of plans.
 *
 * @since 1.0.0
 */
final class PlanService {

	private PlanRepository $plans;
	private UserPlanRepository $user_plans;

	public function __construct( PlanRepository $plans, UserPlanRepository $user_plans ) {
		$this->plans      = $plans;
		$this->user_plans = $user_plans;
	}

	/**
	 * Lists all plans (optionally including inactive).
	 *
	 * @param bool $include_inactive Include inactive.
	 *
	 * @return Plan[]
	 */
	public function list_plans( bool $include_inactive = false ): array {
		return $this->plans->find_all( $include_inactive );
	}

	/**
	 * Persists a plan.
	 *
	 * @param array<string, mixed> $data Plan data.
	 *
	 * @return Plan
	 */
	public function save( array $data ): Plan {
		$id   = $this->plans->upsert( $data );
		$plan = $this->plans->find( $id );
		if ( null === $plan ) {
			throw new \RuntimeException( 'Could not load saved plan.' );
		}
		do_action( 'imgsig/plan/saved', $plan );
		return $plan;
	}

	/**
	 * Assigns a plan to a user.
	 *
	 * @param int    $user_id    User.
	 * @param int    $plan_id    Plan.
	 * @param string $expires_at Optional expiration timestamp (UTC).
	 *
	 * @return void
	 */
	public function assign_to_user( int $user_id, int $plan_id, string $expires_at = '' ): void {
		$this->user_plans->assign( $user_id, $plan_id, '' === $expires_at ? null : $expires_at );

		$plan = $this->plans->find( $plan_id );
		if ( null !== $plan ) {
			/**
			 * Fires after a plan has been assigned to a user.
			 *
			 * @since 1.0.0
			 *
			 * @param int  $user_id User id.
			 * @param Plan $plan    Plan.
			 */
			do_action( 'imgsig/user/plan_assigned', $user_id, $plan );
		}
	}

	/**
	 * Detaches a user from any plan.
	 *
	 * @param int $user_id User.
	 *
	 * @return void
	 */
	public function detach_from_user( int $user_id ): void {
		$this->user_plans->detach( $user_id );
	}
}
