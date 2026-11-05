<?php
/**
 * Personal-data export / erase and user-deletion lifecycle.
 *
 * @package ImaginaSignatures\Privacy
 */

declare(strict_types=1);

namespace ImaginaSignatures\Privacy;

use ImaginaSignatures\Models\Asset;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Storage\Drivers\MediaLibraryDriver;
use ImaginaSignatures\Storage\Drivers\S3Driver;
use ImaginaSignatures\Storage\StorageManager;
use ImaginaSignatures\Storage\UploadPolicy;

defined( 'ABSPATH' ) || exit;

/**
 * Wires the plugin's per-user data into WordPress' privacy tools and
 * user lifecycle:
 *
 *  - Tools → Export Personal Data: every signature (name, status,
 *    dates, full JSON content) and every uploaded asset (URL, type,
 *    size, date) of the user.
 *  - Tools → Erase Personal Data: deletes those signatures and assets,
 *    including the stored files (Media Library attachments, S3
 *    objects).
 *  - `delete_user`: reassigns signatures + assets to the reassign user
 *    when the admin chose one, otherwise deletes them and their files.
 *  - `wpmu_delete_user` (network-level delete): the same purge on every
 *    site of the user.
 *
 * @since 1.0.40
 */
final class UserDataManager {

	/**
	 * Exporter / eraser id.
	 */
	public const ID = 'imagina-signatures';

	/**
	 * Items per exporter / eraser page.
	 */
	private const PAGE_SIZE = 50;

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $signatures;

	/**
	 * @var AssetRepository
	 */
	private AssetRepository $assets;

	/**
	 * @var StorageManager
	 */
	private StorageManager $storage;

	/**
	 * @param SignatureRepository $signatures Signature repository.
	 * @param AssetRepository     $assets     Asset repository.
	 * @param StorageManager      $storage    Storage manager (file deletion).
	 */
	public function __construct( SignatureRepository $signatures, AssetRepository $assets, StorageManager $storage ) {
		$this->signatures = $signatures;
		$this->assets     = $assets;
		$this->storage    = $storage;
	}

	/**
	 * Registers the hooks.
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	public function register(): void {
		add_filter( 'wp_privacy_personal_data_exporters', [ $this, 'register_exporter' ] );
		add_filter( 'wp_privacy_personal_data_erasers', [ $this, 'register_eraser' ] );
		add_action( 'delete_user', [ $this, 'on_delete_user' ], 10, 2 );
		add_action( 'wpmu_delete_user', [ $this, 'on_wpmu_delete_user' ], 10, 1 );
	}

	/**
	 * `wp_privacy_personal_data_exporters` callback.
	 *
	 * @since 1.0.40
	 *
	 * @param array<string, mixed> $exporters Registered exporters.
	 *
	 * @return array<string, mixed>
	 */
	public function register_exporter( $exporters ): array {
		$exporters                = is_array( $exporters ) ? $exporters : [];
		$exporters[ self::ID ] = [
			'exporter_friendly_name' => __( 'Imagina Signatures', 'imagina-signatures' ),
			'callback'               => [ $this, 'export' ],
		];
		return $exporters;
	}

	/**
	 * `wp_privacy_personal_data_erasers` callback.
	 *
	 * @since 1.0.40
	 *
	 * @param array<string, mixed> $erasers Registered erasers.
	 *
	 * @return array<string, mixed>
	 */
	public function register_eraser( $erasers ): array {
		$erasers                = is_array( $erasers ) ? $erasers : [];
		$erasers[ self::ID ] = [
			'eraser_friendly_name' => __( 'Imagina Signatures', 'imagina-signatures' ),
			'callback'             => [ $this, 'erase' ],
		];
		return $erasers;
	}

	/**
	 * Personal-data exporter: signatures first, then assets, paged.
	 *
	 * @since 1.0.40
	 *
	 * @param string $email_address Requester's email.
	 * @param int    $page          1-based page.
	 *
	 * @return array{data: array<int, array<string, mixed>>, done: bool}
	 */
	public function export( $email_address, $page = 1 ): array {
		$user = get_user_by( 'email', (string) $email_address );
		if ( ! $user ) {
			return [
				'data' => [],
				'done' => true,
			];
		}

		$user_id         = (int) $user->ID;
		$page            = max( 1, (int) $page );
		$signature_count = $this->signatures->count_by_user( $user_id );
		$signature_pages = (int) ceil( $signature_count / self::PAGE_SIZE );
		$data            = [];

		if ( $page <= $signature_pages ) {
			$rows = $this->signatures->find_by_user(
				$user_id,
				[
					'page'     => $page,
					'per_page' => self::PAGE_SIZE,
					'order_by' => 'created_at',
					'order'    => 'asc',
				]
			);
			foreach ( $rows as $signature ) {
				$data[] = [
					'group_id'    => 'imgsig-signatures',
					'group_label' => __( 'Email signatures', 'imagina-signatures' ),
					'item_id'     => 'imgsig-signature-' . $signature->id,
					'data'        => [
						[
							'name'  => __( 'Name', 'imagina-signatures' ),
							'value' => $signature->name,
						],
						[
							'name'  => __( 'Status', 'imagina-signatures' ),
							'value' => $signature->status,
						],
						[
							'name'  => __( 'Created (UTC)', 'imagina-signatures' ),
							'value' => $signature->created_at,
						],
						[
							'name'  => __( 'Last updated (UTC)', 'imagina-signatures' ),
							'value' => $signature->updated_at,
						],
						[
							'name'  => __( 'Content (JSON)', 'imagina-signatures' ),
							'value' => $signature->json_content,
						],
					],
				];
			}

			return [
				'data' => $data,
				'done' => false,
			];
		}

		$asset_page = $page - $signature_pages;
		$assets     = $this->assets->find_batch_by_user( $user_id, self::PAGE_SIZE, ( $asset_page - 1 ) * self::PAGE_SIZE );

		foreach ( $assets as $asset ) {
			$data[] = [
				'group_id'    => 'imgsig-assets',
				'group_label' => __( 'Signature uploads', 'imagina-signatures' ),
				'item_id'     => 'imgsig-asset-' . $asset->id,
				'data'        => [
					[
						'name'  => __( 'URL', 'imagina-signatures' ),
						'value' => $asset->public_url,
					],
					[
						'name'  => __( 'Type', 'imagina-signatures' ),
						'value' => $asset->mime_type,
					],
					[
						'name'  => __( 'Size (bytes)', 'imagina-signatures' ),
						'value' => (string) $asset->size_bytes,
					],
					[
						'name'  => __( 'Uploaded (UTC)', 'imagina-signatures' ),
						'value' => $asset->created_at,
					],
				],
			];
		}

		return [
			'data' => $data,
			'done' => count( $assets ) < self::PAGE_SIZE,
		];
	}

	/**
	 * Personal-data eraser: deletes assets (with files) in batches, then
	 * all signatures.
	 *
	 * @since 1.0.40
	 *
	 * @param string $email_address Requester's email.
	 * @param int    $page          1-based page (unused: each call removes the next batch).
	 *
	 * @return array{items_removed: bool, items_retained: bool, messages: array<int, string>, done: bool}
	 */
	public function erase( $email_address, $page = 1 ): array {
		unset( $page );

		$response = [
			'items_removed'  => false,
			'items_retained' => false,
			'messages'       => [],
			'done'           => true,
		];

		$user = get_user_by( 'email', (string) $email_address );
		if ( ! $user ) {
			return $response;
		}

		$user_id = (int) $user->ID;
		$batch   = $this->assets->find_batch_by_user( $user_id, self::PAGE_SIZE );

		foreach ( $batch as $asset ) {
			if ( ! $this->delete_asset_file( $asset ) ) {
				$response['items_retained'] = true;
				$response['messages'][]     = sprintf(
					/* translators: %s: file URL. */
					__( 'The stored file %s could not be deleted from the current storage backend; its record was removed.', 'imagina-signatures' ),
					$asset->public_url
				);
			}
			$this->assets->delete( $asset->id );
			$response['items_removed'] = true;
		}

		if ( count( $batch ) >= self::PAGE_SIZE ) {
			$response['done'] = false;
			return $response;
		}

		if ( $this->signatures->delete_by_user( $user_id ) > 0 ) {
			$response['items_removed'] = true;
		}

		delete_user_meta( $user_id, UploadPolicy::TOKEN_META_KEY );

		return $response;
	}

	/**
	 * `delete_user` handler (single site, or "remove from site").
	 *
	 * @since 1.0.40
	 *
	 * @param int      $user_id  User being deleted.
	 * @param int|null $reassign User to reassign content to, or null.
	 *
	 * @return void
	 */
	public function on_delete_user( $user_id, $reassign = null ): void {
		$user_id  = (int) $user_id;
		$reassign = null === $reassign ? 0 : (int) $reassign;

		if ( $user_id <= 0 ) {
			return;
		}

		if ( $reassign > 0 && $reassign !== $user_id ) {
			$this->signatures->reassign_user( $user_id, $reassign );
			$this->assets->reassign_user( $user_id, $reassign );
			return;
		}

		$this->purge_user( $user_id );
	}

	/**
	 * `wpmu_delete_user` handler: purges the user's data on every site
	 * they belong to (network delete has no reassign option).
	 *
	 * @since 1.0.40
	 *
	 * @param int $user_id User being deleted network-wide.
	 *
	 * @return void
	 */
	public function on_wpmu_delete_user( $user_id ): void {
		$user_id = (int) $user_id;
		if ( $user_id <= 0 || ! function_exists( 'get_blogs_of_user' ) ) {
			return;
		}

		global $wpdb;

		$site_ids = array_map( 'intval', array_keys( (array) get_blogs_of_user( $user_id, true ) ) );
		if ( function_exists( 'get_main_site_id' ) ) {
			$site_ids[] = (int) get_main_site_id();
		}

		foreach ( array_unique( $site_ids ) as $site_id ) {
			switch_to_blog( $site_id );
			try {
				$table = $wpdb->prefix . 'imgsig_signatures';
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- existence probe for a plugin table on another site.
				$exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) );
				if ( null !== $exists ) {
					// Storage config is per site: build a fresh manager.
					$this->purge_user( $user_id, new StorageManager( new Encryption() ) );
				}
			} finally {
				restore_current_blog();
			}
		}
	}

	/**
	 * Deletes every signature and asset (with its stored file) of a user
	 * on the current site.
	 *
	 * @since 1.0.40
	 *
	 * @param int                 $user_id User.
	 * @param StorageManager|null $storage Storage manager for the current site.
	 *
	 * @return void
	 */
	public function purge_user( int $user_id, ?StorageManager $storage = null ): void {
		$storage = $storage ?? $this->storage;

		$previous_first = 0;
		do {
			$batch      = $this->assets->find_batch_by_user( $user_id, self::PAGE_SIZE );
			$batch_size = count( $batch );
			// Bail out if a row refuses to go away (DB error) instead of
			// looping forever on the same batch.
			if ( empty( $batch ) || $batch[0]->id === $previous_first ) {
				break;
			}
			$previous_first = $batch[0]->id;

			foreach ( $batch as $asset ) {
				$this->delete_asset_file( $asset, $storage );
				$this->assets->delete( $asset->id );
			}
		} while ( $batch_size >= self::PAGE_SIZE );

		$this->signatures->delete_by_user( $user_id );
	}

	/**
	 * Deletes an asset's stored bytes from whichever backend holds them.
	 *
	 * @since 1.0.40
	 *
	 * @param Asset               $asset   Asset row.
	 * @param StorageManager|null $storage Storage manager (defaults to the injected one).
	 *
	 * @return bool False when the file could not be deleted.
	 */
	public function delete_asset_file( Asset $asset, ?StorageManager $storage = null ): bool {
		$storage = $storage ?? $this->storage;

		try {
			if ( MediaLibraryDriver::ID === $asset->storage_driver ) {
				// Works whichever driver is active now.
				return ( new MediaLibraryDriver() )->delete( $asset->storage_key );
			}

			if ( S3Driver::ID === $asset->storage_driver ) {
				// Only the active S3 configuration has credentials; objects
				// written under a previous configuration can't be reached.
				$driver = $storage->active_driver();
				return S3Driver::ID === $driver->get_id() ? $driver->delete( $asset->storage_key ) : false;
			}
		} catch ( \Throwable $e ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[imagina-signatures] could not delete stored file for asset ' . $asset->id . ': ' . $e->getMessage() );
			return false;
		}

		// url_only (or unknown) — nothing hosted by the plugin.
		return true;
	}
}
