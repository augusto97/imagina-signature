<?php
/**
 * Inserts the default Free / Pro / Business plans.
 *
 * @package ImaginaSignatures\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup;

use ImaginaSignatures\Models\PlanLimits;
use ImaginaSignatures\Repositories\PlanRepository;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Seeds the three default plans.
 *
 * Idempotent — re-running on an already-seeded site upserts by slug.
 *
 * @since 1.0.0
 */
final class DefaultPlansSeeder {

	private PlanRepository $plans;

	public function __construct( ?PlanRepository $plans = null ) {
		$this->plans = $plans ?? new PlanRepository();
	}

	/**
	 * Seeds default plans.
	 *
	 * @return void
	 */
	public function seed(): void {
		$plans = [
			[
				'slug'        => 'free',
				'name'        => __( 'Free', 'imagina-signatures' ),
				'description' => __( 'Basic plan for individuals.', 'imagina-signatures' ),
				'is_default'  => true,
				'sort_order'  => 1,
				'limits'      => new PlanLimits(
					1,
					10 * 1024 * 1024,
					1024 * 1024,
					false,
					false,
					true,
					false,
					false
				),
			],
			[
				'slug'        => 'pro',
				'name'        => __( 'Pro', 'imagina-signatures' ),
				'description' => __( 'For growing teams.', 'imagina-signatures' ),
				'is_default'  => false,
				'sort_order'  => 2,
				'limits'      => new PlanLimits(
					10,
					200 * 1024 * 1024,
					2 * 1024 * 1024,
					true,
					false,
					true,
					false,
					false
				),
			],
			[
				'slug'        => 'business',
				'name'        => __( 'Business', 'imagina-signatures' ),
				'description' => __( 'For organizations.', 'imagina-signatures' ),
				'is_default'  => false,
				'sort_order'  => 3,
				'limits'      => new PlanLimits(
					50,
					1024 * 1024 * 1024,
					5 * 1024 * 1024,
					true,
					true,
					true,
					true,
					false
				),
			],
		];

		foreach ( $plans as $data ) {
			$this->plans->upsert( $data );
		}
	}
}
