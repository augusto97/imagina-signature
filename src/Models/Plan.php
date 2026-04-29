<?php
/**
 * Plan model.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Represents a plan and its limits.
 *
 * @since 1.0.0
 */
final class Plan extends BaseModel {

	public int $id;
	public string $slug;
	public string $name;
	public ?string $description;
	public PlanLimits $limits;
	public bool $is_default;
	public bool $is_active;
	public int $sort_order;
	public string $created_at;
	public string $updated_at;

	public function __construct(
		int $id,
		string $slug,
		string $name,
		?string $description,
		PlanLimits $limits,
		bool $is_default,
		bool $is_active,
		int $sort_order,
		string $created_at,
		string $updated_at
	) {
		$this->id          = $id;
		$this->slug        = $slug;
		$this->name        = $name;
		$this->description = $description;
		$this->limits      = $limits;
		$this->is_default  = $is_default;
		$this->is_active   = $is_active;
		$this->sort_order  = $sort_order;
		$this->created_at  = $created_at;
		$this->updated_at  = $updated_at;
	}

	/**
	 * {@inheritDoc}
	 */
	public function to_array(): array {
		return [
			'id'          => $this->id,
			'slug'        => $this->slug,
			'name'        => $this->name,
			'description' => $this->description,
			'limits'      => $this->limits->to_array(),
			'is_default'  => $this->is_default,
			'is_active'   => $this->is_active,
			'sort_order'  => $this->sort_order,
			'created_at'  => $this->created_at,
			'updated_at'  => $this->updated_at,
		];
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param array<string, mixed> $row Row.
	 */
	public static function from_row( array $row ): self {
		$limits_data = isset( $row['limits_json'] ) ? json_decode( (string) $row['limits_json'], true ) : [];
		return new self(
			(int) ( $row['id'] ?? 0 ),
			(string) ( $row['slug'] ?? '' ),
			(string) ( $row['name'] ?? '' ),
			isset( $row['description'] ) ? (string) $row['description'] : null,
			PlanLimits::from_array( is_array( $limits_data ) ? $limits_data : [] ),
			! empty( $row['is_default'] ),
			! empty( $row['is_active'] ),
			(int) ( $row['sort_order'] ?? 0 ),
			(string) ( $row['created_at'] ?? '' ),
			(string) ( $row['updated_at'] ?? '' )
		);
	}

	/**
	 * Returns a virtual unlimited plan used in single-user mode.
	 *
	 * @return self
	 */
	public static function unlimited(): self {
		$now = gmdate( 'Y-m-d H:i:s' );
		return new self(
			0,
			'unlimited',
			'Unlimited',
			null,
			PlanLimits::unlimited(),
			true,
			true,
			0,
			$now,
			$now
		);
	}
}
