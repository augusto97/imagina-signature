<?php
/**
 * Asset repository.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

use ImaginaSignatures\Models\Asset;

defined( 'ABSPATH' ) || exit;

/**
 * Data access for `imgsig_assets`.
 *
 * Same ownership-baked-into-SQL pattern as
 * {@see SignatureRepository}: REST controllers always go through
 * {@see find_owned_by()}.
 *
 * {@see find_by_hash()} powers client-side dedup — when the editor
 * uploads a file whose SHA-256 already exists on a row owned by the
 * same user, the upload controller can return that row instead of
 * writing a duplicate.
 *
 * @since 1.0.0
 */
final class AssetRepository extends BaseRepository {

	/**
	 * @inheritDoc
	 */
	protected function table(): string {
		return $this->wpdb->prefix . 'imgsig_assets';
	}

	/**
	 * Fetches by primary key.
	 *
	 * @since 1.0.0
	 *
	 * @param int $id Primary key.
	 *
	 * @return Asset|null
	 */
	public function find( int $id ): ?Asset {
		$row = $this->wpdb->get_row(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$this->wpdb->prepare( "SELECT * FROM {$this->table()} WHERE id = %d", $id ),
			ARRAY_A
		);
		return is_array( $row ) ? Asset::from_row( $row ) : null;
	}

	/**
	 * Fetches when the row is owned by the given user.
	 *
	 * @since 1.0.0
	 *
	 * @param int $asset_id Primary key.
	 * @param int $user_id  Owner.
	 *
	 * @return Asset|null
	 */
	public function find_owned_by( int $asset_id, int $user_id ): ?Asset {
		$row = $this->wpdb->get_row(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$this->wpdb->prepare(
				"SELECT * FROM {$this->table()} WHERE id = %d AND user_id = %d",
				$asset_id,
				$user_id
			),
			ARRAY_A
		);
		return is_array( $row ) ? Asset::from_row( $row ) : null;
	}

	/**
	 * Lists assets owned by the user.
	 *
	 * Supported `$args`:
	 *  - `page`     int  1-indexed.
	 *  - `per_page` int  Items per page (default 50, max 200).
	 *
	 * @since 1.0.0
	 *
	 * @param int                  $user_id Owner.
	 * @param array<string, mixed> $args    Pagination args.
	 *
	 * @return Asset[]
	 */
	public function find_by_user( int $user_id, array $args = [] ): array {
		$per_page = max( 1, min( 200, (int) ( $args['per_page'] ?? 50 ) ) );
		$page     = max( 1, (int) ( $args['page'] ?? 1 ) );
		$offset   = ( $page - 1 ) * $per_page;

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$rows = $this->wpdb->get_results(
			$this->wpdb->prepare(
				"SELECT * FROM {$this->table()} WHERE user_id = %d ORDER BY created_at DESC LIMIT %d OFFSET %d",
				$user_id,
				$per_page,
				$offset
			),
			ARRAY_A
		);

		if ( ! is_array( $rows ) ) {
			return [];
		}

		$out = [];
		foreach ( $rows as $row ) {
			$out[] = Asset::from_row( $row );
		}
		return $out;
	}

	/**
	 * Counts assets owned by the user.
	 *
	 * @since 1.0.0
	 *
	 * @param int $user_id Owner.
	 *
	 * @return int
	 */
	public function count_by_user( int $user_id ): int {
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		return (int) $this->wpdb->get_var(
			$this->wpdb->prepare(
				"SELECT COUNT(*) FROM {$this->table()} WHERE user_id = %d",
				$user_id
			)
		);
	}

	/**
	 * Returns an asset with the given content hash for the given user,
	 * if one exists. Used for client-side dedup at upload time.
	 *
	 * @since 1.0.0
	 *
	 * @param int    $user_id     Owner.
	 * @param string $hash_sha256 Hex SHA-256.
	 *
	 * @return Asset|null
	 */
	public function find_by_hash( int $user_id, string $hash_sha256 ): ?Asset {
		$row = $this->wpdb->get_row(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$this->wpdb->prepare(
				"SELECT * FROM {$this->table()} WHERE user_id = %d AND hash_sha256 = %s LIMIT 1",
				$user_id,
				$hash_sha256
			),
			ARRAY_A
		);
		return is_array( $row ) ? Asset::from_row( $row ) : null;
	}

	/**
	 * Inserts a new asset row.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $data Field values.
	 *
	 * @return Asset
	 */
	public function insert( array $data ): Asset {
		$row = [
			'user_id'        => (int) ( $data['user_id'] ?? 0 ),
			'storage_driver' => (string) ( $data['storage_driver'] ?? '' ),
			'storage_key'    => (string) ( $data['storage_key'] ?? '' ),
			'public_url'     => (string) ( $data['public_url'] ?? '' ),
			'mime_type'      => (string) ( $data['mime_type'] ?? '' ),
			'size_bytes'     => (int) ( $data['size_bytes'] ?? 0 ),
			'width'          => isset( $data['width'] ) ? (int) $data['width'] : null,
			'height'         => isset( $data['height'] ) ? (int) $data['height'] : null,
			'hash_sha256'    => (string) ( $data['hash_sha256'] ?? '' ),
			'created_at'     => $this->now(),
		];

		$this->wpdb->insert(
			$this->table(),
			$row,
			[ '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s' ]
		);

		$row['id'] = (int) $this->wpdb->insert_id;
		return Asset::from_row( $row );
	}

	/**
	 * Deletes by primary key.
	 *
	 * @since 1.0.0
	 *
	 * @param int $id Primary key.
	 *
	 * @return bool
	 */
	public function delete( int $id ): bool {
		$rows = $this->wpdb->delete( $this->table(), [ 'id' => $id ], [ '%d' ] );
		return is_int( $rows ) && $rows > 0;
	}
}
