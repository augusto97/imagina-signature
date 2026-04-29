<?php
/**
 * Pivot row linking a user to a plan.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class UserPlan extends BaseModel {

	public int $user_id;
	public int $plan_id;
	public string $assigned_at;
	public ?string $expires_at;
	/** @var array<string, mixed> */
	public array $metadata;

	/**
	 * @param int                  $user_id     User.
	 * @param int                  $plan_id     Plan.
	 * @param string               $assigned_at Assignment timestamp.
	 * @param string|null          $expires_at  Optional expiration timestamp.
	 * @param array<string, mixed> $metadata    Free-form metadata.
	 */
	public function __construct(
		int $user_id,
		int $plan_id,
		string $assigned_at,
		?string $expires_at = null,
		array $metadata = []
	) {
		$this->user_id     = $user_id;
		$this->plan_id     = $plan_id;
		$this->assigned_at = $assigned_at;
		$this->expires_at  = $expires_at;
		$this->metadata    = $metadata;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'user_id'     => $this->user_id,
			'plan_id'     => $this->plan_id,
			'assigned_at' => $this->assigned_at,
			'expires_at'  => $this->expires_at,
			'metadata'    => $this->metadata,
		];
	}

	/**
	 * @param array<string, mixed> $row Row.
	 */
	public static function from_row( array $row ): self {
		$meta = isset( $row['metadata'] ) ? json_decode( (string) $row['metadata'], true ) : [];
		return new self(
			(int) ( $row['user_id'] ?? 0 ),
			(int) ( $row['plan_id'] ?? 0 ),
			(string) ( $row['assigned_at'] ?? gmdate( 'Y-m-d H:i:s' ) ),
			isset( $row['expires_at'] ) ? (string) $row['expires_at'] : null,
			is_array( $meta ) ? $meta : []
		);
	}
}
