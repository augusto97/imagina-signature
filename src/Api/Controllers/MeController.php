<?php
/**
 * REST controller for /me.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Repositories\UsageRepository;
use ImaginaSignatures\Services\QuotaEnforcer;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Returns information about the current user — plan, capabilities, usage.
 *
 * @since 1.0.0
 */
final class MeController extends BaseController {

	private QuotaEnforcer $quota;
	private UsageRepository $usage;

	public function __construct( QuotaEnforcer $quota, UsageRepository $usage ) {
		$this->quota = $quota;
		$this->usage = $usage;
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/me',
			[
				'methods'             => 'GET',
				'callback'            => [ $this, 'show' ],
				'permission_callback' => static fn(): bool => is_user_logged_in(),
			]
		);
	}

	public function show( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();
		$user    = wp_get_current_user();
		$plan    = $this->quota->plan_for_user( $user_id );
		$usage   = $this->usage->get_for_user( $user_id );

		return rest_ensure_response(
			[
				'user'         => [
					'id'           => (int) $user->ID,
					'display_name' => $user->display_name,
					'email'        => $user->user_email,
				],
				'plan'         => $plan->to_array(),
				'usage'        => $usage->to_array(),
				'capabilities' => array_keys( array_filter( (array) $user->allcaps ) ),
				'mode'         => (string) get_option( 'imgsig_mode', 'single' ),
			]
		);
	}
}
