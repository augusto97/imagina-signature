<?php
/**
 * Plan-quota enforcement.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Exceptions\QuotaExceededException;
use ImaginaSignatures\Models\Plan;
use ImaginaSignatures\Repositories\PlanRepository;
use ImaginaSignatures\Repositories\UsageRepository;
use ImaginaSignatures\Repositories\UserPlanRepository;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Validates quota requirements before mutating operations.
 *
 * In single-user mode, the enforcer returns a virtual unlimited plan and
 * skips every check. In multi-user mode, it consults the user's plan
 * assignment (or the default plan) and the cached usage record.
 *
 * @since 1.0.0
 */
final class QuotaEnforcer {

	private PlanRepository $plans;
	private UserPlanRepository $user_plans;
	private UsageRepository $usage;

	/**
	 * @param PlanRepository     $plans      Plans.
	 * @param UserPlanRepository $user_plans Pivot.
	 * @param UsageRepository    $usage      Usage cache.
	 */
	public function __construct(
		PlanRepository $plans,
		UserPlanRepository $user_plans,
		UsageRepository $usage
	) {
		$this->plans      = $plans;
		$this->user_plans = $user_plans;
		$this->usage      = $usage;
	}

	/**
	 * Returns the plan applicable to a user.
	 *
	 * @param int $user_id User id.
	 *
	 * @return Plan
	 */
	public function plan_for_user( int $user_id ): Plan {
		if ( 'single' === (string) get_option( 'imgsig_mode', 'single' ) ) {
			return Plan::unlimited();
		}

		$assignment = $this->user_plans->find_for_user( $user_id );
		if ( null !== $assignment ) {
			$plan = $this->plans->find( $assignment->plan_id );
			if ( null !== $plan ) {
				return $this->apply_plan_filters( $plan, $user_id );
			}
		}

		$default = $this->plans->get_default();
		if ( null !== $default ) {
			return $this->apply_plan_filters( $default, $user_id );
		}

		return Plan::unlimited();
	}

	/**
	 * Throws if creating another signature would exceed the user's plan.
	 *
	 * @param int $user_id User id.
	 *
	 * @throws QuotaExceededException When the limit would be exceeded.
	 */
	public function check_can_create_signature( int $user_id ): void {
		$plan  = $this->plan_for_user( $user_id );
		$usage = $this->usage->get_for_user( $user_id );

		if ( $usage->signatures_count >= $plan->limits->max_signatures ) {
			throw new QuotaExceededException(
				sprintf(
					/* translators: %d: max signatures. */
					__( 'Signature limit reached (%d). Upgrade your plan.', 'imagina-signatures' ),
					$plan->limits->max_signatures
				)
			);
		}
	}

	/**
	 * Throws if uploading another asset would exceed the user's plan.
	 *
	 * @param int $user_id User id.
	 * @param int $size    Size in bytes of the incoming upload.
	 *
	 * @throws QuotaExceededException When a limit would be exceeded.
	 */
	public function check_can_upload( int $user_id, int $size ): void {
		$plan  = $this->plan_for_user( $user_id );
		$usage = $this->usage->get_for_user( $user_id );

		if ( $size > $plan->limits->max_image_size_bytes ) {
			throw new QuotaExceededException(
				__( 'Image is larger than your plan allows.', 'imagina-signatures' )
			);
		}

		if ( $usage->storage_bytes + $size > $plan->limits->max_storage_bytes ) {
			throw new QuotaExceededException(
				__( 'Storage limit would be exceeded.', 'imagina-signatures' )
			);
		}
	}

	/**
	 * Applies the `imgsig/plan/limits` filter so integrations can override limits.
	 *
	 * @param Plan $plan    Plan.
	 * @param int  $user_id User id.
	 *
	 * @return Plan
	 */
	private function apply_plan_filters( Plan $plan, int $user_id ): Plan {
		/**
		 * Filters the limits applied to a plan for a given user.
		 *
		 * @since 1.0.0
		 *
		 * @param \ImaginaSignatures\Models\PlanLimits $limits  Plan limits.
		 * @param Plan                                 $plan    Plan.
		 * @param int                                  $user_id User id.
		 */
		$limits         = apply_filters( 'imgsig/plan/limits', $plan->limits, $plan, $user_id );
		$plan->limits   = $limits instanceof \ImaginaSignatures\Models\PlanLimits ? $limits : $plan->limits;
		return $plan;
	}
}
