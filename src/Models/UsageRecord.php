<?php
/**
 * Cached per-user usage metrics.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class UsageRecord extends BaseModel {

	public int $user_id;
	public int $signatures_count;
	public int $storage_bytes;
	public ?string $last_activity_at;
	public string $updated_at;

	public function __construct(
		int $user_id,
		int $signatures_count = 0,
		int $storage_bytes = 0,
		?string $last_activity_at = null,
		?string $updated_at = null
	) {
		$this->user_id          = $user_id;
		$this->signatures_count = $signatures_count;
		$this->storage_bytes    = $storage_bytes;
		$this->last_activity_at = $last_activity_at;
		$this->updated_at       = $updated_at ?? gmdate( 'Y-m-d H:i:s' );
	}

	/**
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'user_id'          => $this->user_id,
			'signatures_count' => $this->signatures_count,
			'storage_bytes'    => $this->storage_bytes,
			'last_activity_at' => $this->last_activity_at,
			'updated_at'       => $this->updated_at,
		];
	}

	/**
	 * @param array<string, mixed> $row Row.
	 */
	public static function from_row( array $row ): self {
		return new self(
			(int) ( $row['user_id'] ?? 0 ),
			(int) ( $row['signatures_count'] ?? 0 ),
			(int) ( $row['storage_bytes'] ?? 0 ),
			isset( $row['last_activity_at'] ) ? (string) $row['last_activity_at'] : null,
			isset( $row['updated_at'] ) ? (string) $row['updated_at'] : null
		);
	}
}
