<?php
/**
 * Assets endpoints (list / delete).
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Api\Middleware\OwnershipCheck;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Storage\StorageManager;

defined( 'ABSPATH' ) || exit;

/**
 * Asset endpoints (CLAUDE.md §16.2).
 *
 * Routes:
 *  - `GET    /assets`     — list assets owned by the calling user.
 *  - `DELETE /assets/:id` — delete an asset (DB row + backend object).
 *
 * Per CLAUDE.md §15.3 every operation enforces ownership at the SQL
 * level (`AssetRepository::find_owned_by`). DELETE additionally
 * removes the bytes from whichever storage backend wrote them; a
 * backend failure is non-fatal — the row is still removed so a
 * dangling reference can't keep the editor stuck (the next sweep
 * task can reconcile orphaned objects).
 *
 * @since 1.0.0
 */
final class AssetsController extends BaseController {

	/**
	 * @var AssetRepository
	 */
	private AssetRepository $repo;

	/**
	 * @var StorageManager
	 */
	private StorageManager $storage;

	/**
	 * @param AssetRepository $repo    Asset repository.
	 * @param StorageManager  $storage Storage manager (active driver delete).
	 */
	public function __construct( AssetRepository $repo, StorageManager $storage ) {
		$this->repo    = $repo;
		$this->storage = $storage;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_use = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_USE );
		$ownership   = ( new OwnershipCheck(
			CapabilitiesInstaller::CAP_USE,
			[ $this, 'owns_asset' ]
		) )->callback();

		register_rest_route(
			self::NAMESPACE,
			'/assets',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'index' ],
					'permission_callback' => $require_use,
					'args'                => [
						'page'     => [ 'type' => 'integer', 'minimum' => 1, 'default' => 1 ],
						'per_page' => [ 'type' => 'integer', 'minimum' => 1, 'maximum' => 200, 'default' => 50 ],
					],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/assets/(?P<id>\d+)',
			[
				[
					'methods'             => 'DELETE',
					'callback'            => [ $this, 'delete' ],
					'permission_callback' => $ownership,
				],
			]
		);
	}

	/**
	 * Ownership probe used by the OwnershipCheck middleware.
	 *
	 * @since 1.0.0
	 *
	 * @param int $asset_id Asset primary key.
	 * @param int $user_id  Caller's user ID.
	 *
	 * @return bool
	 */
	public function owns_asset( int $asset_id, int $user_id ): bool {
		return null !== $this->repo->find_owned_by( $asset_id, $user_id );
	}

	/**
	 * `GET /assets` — list assets owned by the calling user.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function index( \WP_REST_Request $request ): \WP_REST_Response {
		$user_id  = get_current_user_id();
		$page     = $this->read_int( $request, 'page', 1 );
		$per_page = $this->read_int( $request, 'per_page', 50 );

		$assets = $this->repo->find_by_user(
			$user_id,
			[
				'page'     => $page,
				'per_page' => $per_page,
			]
		);
		$total  = $this->repo->count_by_user( $user_id );

		$payload = [];
		foreach ( $assets as $asset ) {
			$payload[] = $asset->to_array();
		}

		return $this->paginated_response( $payload, $total, $per_page );
	}

	/**
	 * `DELETE /assets/:id` — delete an asset.
	 *
	 * Removes the DB row first, then asks the active driver to drop
	 * the underlying object. A driver failure does NOT roll back the
	 * row deletion: the user-visible state (the asset is gone from
	 * the editor) wins; orphaned bytes can be reconciled later.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete( \WP_REST_Request $request ) {
		$user_id  = get_current_user_id();
		$asset_id = (int) $request['id'];

		$asset = $this->repo->find_owned_by( $asset_id, $user_id );
		if ( null === $asset ) {
			return new \WP_Error(
				'imgsig_not_found',
				__( 'Asset not found.', 'imagina-signatures' ),
				[ 'status' => 404 ]
			);
		}

		$this->repo->delete( $asset_id );

		// Best-effort: ask the active driver to drop the bytes. We
		// only call it if the asset claims to live on the active
		// driver (otherwise we'd be calling an unrelated backend).
		try {
			$driver = $this->storage->active_driver();
			if ( $driver->get_id() === $asset->storage_driver ) {
				$driver->delete( $asset->storage_key );
			}
		} catch ( ImaginaSignaturesException $e ) {
			// Row is gone; surfacing a 500 here would confuse the
			// editor (deletion already succeeded from the user's
			// perspective). Log via the action hook for ops.
			do_action( 'imgsig/asset/delete_backend_failed', $asset, $e );
		}

		do_action( 'imgsig/asset/deleted', $asset_id );

		return rest_ensure_response( [ 'deleted' => true ] );
	}
}
