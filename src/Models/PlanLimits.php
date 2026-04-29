<?php
/**
 * Plan limits value object.
 *
 * @package ImaginaSignatures\Models
 */

declare(strict_types=1);

namespace ImaginaSignatures\Models;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Limits attached to a plan.
 *
 * @since 1.0.0
 */
final class PlanLimits {

	public int $max_signatures;
	public int $max_storage_bytes;
	public int $max_image_size_bytes;
	public bool $allow_premium_templates;
	public bool $allow_animations;
	public bool $allow_html_export;
	public bool $allow_custom_branding;
	public bool $allow_oauth_install;
	/** @var array<string, mixed> */
	public array $custom_limits;

	/**
	 * @param int                  $max_signatures           Maximum signatures.
	 * @param int                  $max_storage_bytes        Maximum storage bytes.
	 * @param int                  $max_image_size_bytes     Maximum image size.
	 * @param bool                 $allow_premium_templates  Allow premium templates.
	 * @param bool                 $allow_animations         Allow animations.
	 * @param bool                 $allow_html_export        Allow HTML export.
	 * @param bool                 $allow_custom_branding    Allow custom branding.
	 * @param bool                 $allow_oauth_install      Allow OAuth install.
	 * @param array<string, mixed> $custom_limits            Extra limits.
	 */
	public function __construct(
		int $max_signatures = 10,
		int $max_storage_bytes = 104857600,
		int $max_image_size_bytes = 2097152,
		bool $allow_premium_templates = false,
		bool $allow_animations = false,
		bool $allow_html_export = true,
		bool $allow_custom_branding = false,
		bool $allow_oauth_install = false,
		array $custom_limits = []
	) {
		$this->max_signatures          = $max_signatures;
		$this->max_storage_bytes       = $max_storage_bytes;
		$this->max_image_size_bytes    = $max_image_size_bytes;
		$this->allow_premium_templates = $allow_premium_templates;
		$this->allow_animations        = $allow_animations;
		$this->allow_html_export       = $allow_html_export;
		$this->allow_custom_branding   = $allow_custom_branding;
		$this->allow_oauth_install     = $allow_oauth_install;
		$this->custom_limits           = $custom_limits;
	}

	/**
	 * Returns an unlimited plan (used in single-user mode).
	 *
	 * @return self
	 */
	public static function unlimited(): self {
		return new self(
			PHP_INT_MAX,
			PHP_INT_MAX,
			PHP_INT_MAX,
			true,
			true,
			true,
			true,
			true
		);
	}

	/**
	 * Hydrates from an array.
	 *
	 * @param array<string, mixed> $data Source.
	 *
	 * @return self
	 */
	public static function from_array( array $data ): self {
		return new self(
			(int) ( $data['max_signatures'] ?? 10 ),
			(int) ( $data['max_storage_bytes'] ?? 104857600 ),
			(int) ( $data['max_image_size_bytes'] ?? 2097152 ),
			! empty( $data['allow_premium_templates'] ),
			! empty( $data['allow_animations'] ),
			! isset( $data['allow_html_export'] ) || (bool) $data['allow_html_export'],
			! empty( $data['allow_custom_branding'] ),
			! empty( $data['allow_oauth_install'] ),
			isset( $data['custom_limits'] ) && is_array( $data['custom_limits'] ) ? $data['custom_limits'] : []
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return [
			'max_signatures'          => $this->max_signatures,
			'max_storage_bytes'       => $this->max_storage_bytes,
			'max_image_size_bytes'    => $this->max_image_size_bytes,
			'allow_premium_templates' => $this->allow_premium_templates,
			'allow_animations'        => $this->allow_animations,
			'allow_html_export'       => $this->allow_html_export,
			'allow_custom_branding'   => $this->allow_custom_branding,
			'allow_oauth_install'     => $this->allow_oauth_install,
			'custom_limits'           => $this->custom_limits,
		];
	}
}
