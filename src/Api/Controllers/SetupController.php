<?php
/**
 * REST controller for the first-run setup wizard.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Persists the choices made by the admin in the setup wizard.
 *
 * @since 1.0.0
 */
final class SetupController extends BaseController {

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/admin/setup',
			[
				'methods'             => 'POST',
				'callback'            => [ $this, 'save' ],
				'permission_callback' => $this->permission_for( 'imgsig_admin' ),
			]
		);
	}

	public function save( \WP_REST_Request $request ) {
		$mode   = sanitize_key( (string) $request->get_param( 'mode' ) );
		$driver = sanitize_key( (string) $request->get_param( 'storage_driver' ) );

		if ( in_array( $mode, [ 'single', 'multi' ], true ) ) {
			update_option( 'imgsig_mode', $mode, false );
		}
		if ( in_array( $driver, [ 'media_library', 's3' ], true ) ) {
			update_option( 'imgsig_storage_driver', $driver, false );
		}

		update_option( 'imgsig_setup_completed', true, false );

		return rest_ensure_response( [ 'ok' => true ] );
	}
}
