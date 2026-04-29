<?php
/**
 * Paid Memberships Pro integration.
 *
 * @package ImaginaSignatures\Integrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Integrations;

use ImaginaSignatures\Services\PlanService;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Maps PMP membership levels to plugin plans.
 *
 * The mapping is configurable via the `imgsig/integrations/pmp/level_map`
 * filter (`[ pmp_level_id => plan_slug ]`).
 *
 * @since 1.0.0
 */
final class PaidMembershipsPro {

	private PlanService $plans;

	public function __construct( PlanService $plans ) {
		$this->plans = $plans;
	}

	/**
	 * Hooks into PMP if active.
	 *
	 * @return void
	 */
	public function register(): void {
		if ( ! function_exists( 'pmpro_getMembershipLevelForUser' ) ) {
			return;
		}
		add_action( 'pmpro_after_change_membership_level', [ $this, 'on_level_change' ], 10, 2 );
	}

	/**
	 * Handles a level change event.
	 *
	 * @param int $level_id PMP level id.
	 * @param int $user_id  WP user id.
	 *
	 * @return void
	 */
	public function on_level_change( $level_id, $user_id ): void {
		$map = (array) apply_filters( 'imgsig/integrations/pmp/level_map', [] );
		$slug = $map[ (int) $level_id ] ?? '';
		if ( '' === $slug ) {
			return;
		}
		// Resolution to plan id is done by the service layer in a future iteration.
		do_action( 'imgsig/integrations/pmp/applied', (int) $user_id, (int) $level_id, $slug );
	}
}
