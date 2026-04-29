<?php
/**
 * REST controller for /assets.
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Repositories\UsageRepository;
use ImaginaSignatures\Storage\StorageManager;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Lists and deletes user assets.
 *
 * Uploads are handled by `UploadController`.
 *
 * @since 1.0.0
 */
final class AssetsController extends BaseController {

	private AssetRepository $assets;
	private UsageRepository $usage;
	private StorageManager $storage;

	public function __construct( AssetRepository $assets, UsageRepository $usage, StorageManager $storage ) {
		$this->assets  = $assets;
		$this->usage   = $usage;
		$this->storage = $storage;
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/assets',
			[
				'methods'             => 'GET',
				'callback'            => [ $this, 'index' ],
				'permission_callback' => $this->permission_for( 'imgsig_upload_assets' ),
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/assets/(?P<id>\\d+)',
			[
				'methods'             => 'DELETE',
				'callback'            => [ $this, 'destroy' ],
				'permission_callback' => $this->permission_for( 'imgsig_upload_assets' ),
			]
		);
	}

	public function index( \WP_REST_Request $request ) {
		$user_id  = get_current_user_id();
		$per_page = max( 1, min( 100, (int) ( $request->get_param( 'per_page' ) ?? 50 ) ) );
		$page     = max( 1, (int) ( $request->get_param( 'page' ) ?? 1 ) );
		$assets   = $this->assets->find_by_user( $user_id, $per_page, ( $page - 1 ) * $per_page );

		return rest_ensure_response(
			[
				'items' => array_map( static fn( $a ) => $a->to_array(), $assets ),
				'total' => count( $assets ),
			]
		);
	}

	public function destroy( \WP_REST_Request $request ) {
		$user_id = get_current_user_id();
		$asset   = $this->assets->find( (int) $request->get_param( 'id' ) );
		if ( null === $asset ) {
			return new \WP_Error( 'imgsig_not_found', __( 'Asset not found.', 'imagina-signatures' ), [ 'status' => 404 ] );
		}
		if ( $asset->user_id !== $user_id && ! current_user_can( 'imgsig_admin' ) ) {
			return new \WP_Error( 'imgsig_forbidden', '', [ 'status' => 403 ] );
		}

		$driver = $this->storage->build_driver( $asset->storage_driver );
		$driver->delete( $asset->storage_key );
		$this->assets->delete( $asset->id );
		$this->usage->adjust( $user_id, 0, -1 * $asset->size_bytes );

		do_action( 'imgsig/asset/deleted', $asset->id );

		return rest_ensure_response( [ 'deleted' => true ] );
	}
}
