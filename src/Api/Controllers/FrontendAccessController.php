<?php
/**
 * Frontend access settings REST endpoint.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Frontend\FrontendAccess;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * `/admin/frontend-access` — read + write the public-route settings.
 *
 * Gated on `imgsig_manage_storage` (the existing "site admin" cap)
 * because enabling the public route + granting `CAP_USE` to additional
 * roles is the same kind of site-level decision as picking a storage
 * driver. The endpoint isn't user-scoped — there's exactly one site
 * config.
 *
 * `available_roles` in the GET response is a convenience so the admin
 * UI can render checkboxes without a second round trip. Lists every
 * WordPress role known to this install with its display name.
 *
 * @since 1.0.24
 */
final class FrontendAccessController extends BaseController {

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_admin = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_STORAGE );

		register_rest_route(
			self::NAMESPACE,
			'/admin/frontend-access',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $require_admin,
				],
				[
					'methods'             => 'PATCH',
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $require_admin,
				],
			]
		);
	}

	/**
	 * `GET /admin/frontend-access`.
	 *
	 * @since 1.0.24
	 *
	 * @return \WP_REST_Response
	 */
	public function show(): \WP_REST_Response {
		return rest_ensure_response( $this->build_response( FrontendAccess::current() ) );
	}

	/**
	 * `PATCH /admin/frontend-access`.
	 *
	 * @since 1.0.24
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function update( \WP_REST_Request $request ): \WP_REST_Response {
		$next = [
			'enabled' => (bool) $request->get_param( 'enabled' ),
			'slug'    => (string) ( $request->get_param( 'slug' ) ?? '' ),
			'roles'   => (array) ( $request->get_param( 'roles' ) ?? [] ),
		];
		$settings = FrontendAccess::update( $next );
		return rest_ensure_response( $this->build_response( $settings ) );
	}

	/**
	 * Wraps the persisted settings with the list of selectable roles
	 * so the admin UI can render checkboxes for "which roles get
	 * access" without a second REST call.
	 *
	 * @since 1.0.24
	 *
	 * @param array{enabled: bool, slug: string, roles: array<int, string>} $settings Persisted.
	 *
	 * @return array<string, mixed>
	 */
	private function build_response( array $settings ): array {
		$available = [];
		foreach ( wp_roles()->roles as $slug => $role ) {
			$available[] = [
				'slug'  => (string) $slug,
				'label' => isset( $role['name'] ) ? translate_user_role( (string) $role['name'] ) : (string) $slug,
			];
		}

		return [
			'enabled'         => $settings['enabled'],
			'slug'            => $settings['slug'],
			'roles'           => $settings['roles'],
			'available_roles' => $available,
			'dashboard_url'   => FrontendAccess::dashboard_url(),
		];
	}
}
