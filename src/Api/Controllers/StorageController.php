<?php
/**
 * REST controller for /admin/storage.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Storage\S3\ProviderPresets;
use ImaginaSignatures\Storage\StorageManager;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Storage configuration endpoints (admin only).
 *
 * Sensitive fields (`secret_key`) are never returned to the frontend.
 *
 * @since 1.0.0
 */
final class StorageController extends BaseController {

	private StorageManager $storage;

	public function __construct( StorageManager $storage ) {
		$this->storage = $storage;
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/admin/storage',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_storage' ),
				],
				[
					'methods'             => 'PATCH',
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $this->permission_for( 'imgsig_manage_storage' ),
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/storage/test',
			[
				'methods'             => 'POST',
				'callback'            => [ $this, 'test' ],
				'permission_callback' => $this->permission_for( 'imgsig_manage_storage' ),
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/storage/presets',
			[
				'methods'             => 'GET',
				'callback'            => [ $this, 'presets' ],
				'permission_callback' => $this->permission_for( 'imgsig_manage_storage' ),
			]
		);
	}

	public function show( \WP_REST_Request $request ) {
		$config = $this->storage->decrypt_config();
		// Strip secrets before returning.
		if ( isset( $config['secret_key'] ) ) {
			$config['secret_key_set'] = '' !== $config['secret_key'];
			unset( $config['secret_key'] );
		}

		return rest_ensure_response(
			[
				'driver' => (string) get_option( 'imgsig_storage_driver', 'media_library' ),
				'config' => $config,
			]
		);
	}

	public function update( \WP_REST_Request $request ) {
		$driver = sanitize_key( (string) $request->get_param( 'driver' ) );
		if ( ! in_array( $driver, [ 'media_library', 's3' ], true ) ) {
			return new \WP_Error( 'imgsig_invalid_driver', '', [ 'status' => 400 ] );
		}

		$old_driver = (string) get_option( 'imgsig_storage_driver', 'media_library' );
		update_option( 'imgsig_storage_driver', $driver, false );

		$config = $request->get_param( 'config' );
		if ( is_array( $config ) ) {
			$existing = $this->storage->decrypt_config();
			$merged   = array_merge( $existing, $config );
			$this->storage->save_config( $merged );
		}

		do_action( 'imgsig/storage/driver_changed', $old_driver, $driver );

		return $this->show( $request );
	}

	public function test( \WP_REST_Request $request ) {
		$driver = $this->storage->get_active_driver();
		$result = $driver->test_connection();
		return rest_ensure_response( $result->to_array() );
	}

	public function presets( \WP_REST_Request $request ) {
		return rest_ensure_response(
			[
				'items' => ProviderPresets::all(),
			]
		);
	}
}
