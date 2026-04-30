<?php
/**
 * Current-user info endpoint.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * `GET /me` — returns the calling user's identity and the plugin
 * capabilities they hold.
 *
 * The editor uses this on boot to decide which UI to surface
 * (template management, storage settings, etc. only render when the
 * current user has the matching cap). Includes the user's locale so
 * the editor can pick the right translation bundle without a separate
 * round-trip.
 *
 * @since 1.0.0
 */
final class MeController extends BaseController {

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/me',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_USE ),
				],
			]
		);
	}

	/**
	 * Handler: returns the current user's identity + capability set.
	 *
	 * @since 1.0.0
	 *
	 * @return \WP_REST_Response
	 */
	public function show(): \WP_REST_Response {
		$user = wp_get_current_user();

		$capabilities = [
			CapabilitiesInstaller::CAP_USE              => current_user_can( CapabilitiesInstaller::CAP_USE ),
			CapabilitiesInstaller::CAP_MANAGE_TEMPLATES => current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ),
			CapabilitiesInstaller::CAP_MANAGE_STORAGE   => current_user_can( CapabilitiesInstaller::CAP_MANAGE_STORAGE ),
		];

		return rest_ensure_response(
			[
				'id'           => (int) $user->ID,
				'login'        => $user->user_login,
				'display_name' => $user->display_name,
				'email'        => $user->user_email,
				'locale'       => get_user_locale( $user->ID ),
				'capabilities' => $capabilities,
			]
		);
	}
}
