<?php
/**
 * Repository for the `assets` table.
 *
 * @package ImaginaSignatures\Repositories
 */

declare(strict_types=1);

namespace ImaginaSignatures\Repositories;

use ImaginaSignatures\Models\Asset;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class AssetRepository extends BaseRepository {

	protected function table(): string {
		return $this->db()->prefix . 'imgsig_assets';
	}

	/**
	 * Lists assets for a user.
	 *
	 * @param int $user_id User id.
	 * @param int $limit   Page size.
	 * @param int $offset  Offset.
	 *
	 * @return Asset[]
	 */
	public function find_by_user( int $user_id, int $limit = 50, int $offset = 0 ): array {
		$rows = $this->db()->get_results(
			$this->db()->prepare(
				'SELECT * FROM ' . $this->table() . ' WHERE user_id = %d ORDER BY created_at DESC LIMIT %d OFFSET %d',
				$user_id,
				$limit,
				$offset
			),
			ARRAY_A
		);
		return array_map( static fn( array $row ) => Asset::from_row( $row ), is_array( $rows ) ? $rows : [] );
	}

	/**
	 * Finds an asset by id.
	 *
	 * @param int $id Asset id.
	 *
	 * @return Asset|null
	 */
	public function find( int $id ): ?Asset {
		$row = $this->db()->get_row(
			$this->db()->prepare( 'SELECT * FROM ' . $this->table() . ' WHERE id = %d', $id ),
			ARRAY_A
		);
		return is_array( $row ) ? Asset::from_row( $row ) : null;
	}

	/**
	 * Inserts an asset row.
	 *
	 * @param array<string, mixed> $data Asset fields.
	 *
	 * @return int
	 */
	public function create( array $data ): int {
		$record = [
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
		$this->db()->insert( $this->table(), $record );
		return (int) $this->db()->insert_id;
	}

	/**
	 * Deletes an asset.
	 *
	 * @param int $id Asset id.
	 *
	 * @return bool
	 */
	public function delete( int $id ): bool {
		return (bool) $this->db()->delete( $this->table(), [ 'id' => $id ], [ '%d' ] );
	}

	/**
	 * Returns total bytes used by a user.
	 *
	 * @param int $user_id User id.
	 *
	 * @return int
	 */
	public function bytes_for_user( int $user_id ): int {
		return (int) $this->db()->get_var(
			$this->db()->prepare( 'SELECT COALESCE(SUM(size_bytes), 0) FROM ' . $this->table() . ' WHERE user_id = %d', $user_id )
		);
	}
}
