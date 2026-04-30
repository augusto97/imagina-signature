<?php
/**
 * S3-compatible provider presets.
 *
 * @package ImaginaSignatures\Storage\S3
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\S3;

defined( 'ABSPATH' ) || exit;

/**
 * Static catalogue of supported S3-compatible providers.
 *
 * Used by the storage settings page (CLAUDE.md §17.4) to build the
 * "Provider" dropdown and decide which extra fields to render. Each
 * preset describes:
 *
 *  - `name`              — human label
 *  - `endpoint_template` — URL with `{placeholder}` tokens replaced at
 *                          runtime by user-supplied values
 *  - `region`            — fixed region (only Cloudflare R2)
 *  - `region_options`    — closed list of allowed regions (Bunny)
 *  - `extra_fields`      — non-standard fields the user must supply
 *                          (account_id for R2, custom_endpoint for "custom")
 *
 * Adding a new preset is purely declarative. The S3 driver stays generic:
 * it only knows the resolved endpoint URL, bucket, and region.
 *
 * @since 1.0.0
 */
final class ProviderPresets {

	/**
	 * The preset map. Keys are preset IDs persisted on `imgsig_storage_config`.
	 *
	 * Each row carries:
	 *  - `name`              human label.
	 *  - `endpoint_template` URL with `{placeholder}` tokens replaced at runtime.
	 *  - `region`            (optional) fixed region for providers that ignore it.
	 *  - `region_options`    (optional) closed allow-list of regions.
	 *  - `extra_fields`      (optional) extra fields the user must supply
	 *                        beyond bucket / access_key / secret_key.
	 *  - `path_style`        URL style. `true` produces
	 *                        `https://endpoint/bucket/key` (compatible with
	 *                        every shipped provider as of v1.0). `false`
	 *                        would produce `https://bucket.endpoint/key` —
	 *                        not yet implemented in S3Client / PresignedUrl.
	 *                        Reserved for the future AWS S3 path-style
	 *                        deprecation cutover.
	 *
	 * Bunny.net Edge Storage is intentionally NOT in this list — its native
	 * API uses an AccessKey HTTP header, not SigV4 + bucket addressing,
	 * which the generic S3 driver here can't sign. Users who need Bunny
	 * with the (separate) S3-compatible mode should configure the
	 * `custom` preset with the appropriate endpoint URL.
	 *
	 * @var array<string, array<string, mixed>>
	 */
	public const PRESETS = [
		'cloudflare_r2' => [
			'name'              => 'Cloudflare R2',
			'endpoint_template' => 'https://{account_id}.r2.cloudflarestorage.com',
			'region'            => 'auto',
			'extra_fields'      => [ 'account_id' ],
			'path_style'        => true,
		],
		's3'            => [
			'name'              => 'Amazon S3',
			'endpoint_template' => 'https://s3.{region}.amazonaws.com',
			'path_style'        => true,
		],
		'b2'            => [
			'name'              => 'Backblaze B2',
			'endpoint_template' => 'https://s3.{region}.backblazeb2.com',
			'path_style'        => true,
		],
		'do_spaces'     => [
			'name'              => 'DigitalOcean Spaces',
			'endpoint_template' => 'https://{region}.digitaloceanspaces.com',
			'path_style'        => true,
		],
		'wasabi'        => [
			'name'              => 'Wasabi',
			'endpoint_template' => 'https://s3.{region}.wasabisys.com',
			'path_style'        => true,
		],
		'custom'        => [
			'name'         => 'Custom S3-compatible',
			'extra_fields' => [ 'custom_endpoint' ],
			'path_style'   => true,
		],
	];

	/**
	 * Returns true when the given preset ID exists.
	 *
	 * @since 1.0.0
	 *
	 * @param string $id Preset ID.
	 *
	 * @return bool
	 */
	public static function exists( string $id ): bool {
		return array_key_exists( $id, self::PRESETS );
	}

	/**
	 * Returns the preset row, or null when the ID is unknown.
	 *
	 * @since 1.0.0
	 *
	 * @param string $id Preset ID.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function get( string $id ): ?array {
		return self::PRESETS[ $id ] ?? null;
	}

	/**
	 * Resolves the endpoint URL for a preset given a region and any extra
	 * field values the user has supplied.
	 *
	 * For the `custom` preset the value of `extra_fields[custom_endpoint]`
	 * is returned verbatim. For any preset whose template uses `{region}`
	 * the supplied region is substituted in. R2 ignores the region (its
	 * region is fixed to `auto`).
	 *
	 * @since 1.0.0
	 *
	 * @param string                $id           Preset ID.
	 * @param string                $region       Region selected by the user.
	 * @param array<string, string> $extra_fields Map of extra field values.
	 *
	 * @return string Resolved endpoint URL.
	 */
	public static function resolve_endpoint( string $id, string $region, array $extra_fields = [] ): string {
		$preset = self::get( $id );
		if ( null === $preset ) {
			return '';
		}

		// "custom" preset: the user supplies the entire URL.
		if ( 'custom' === $id ) {
			return (string) ( $extra_fields['custom_endpoint'] ?? '' );
		}

		$template = (string) ( $preset['endpoint_template'] ?? '' );
		$template = str_replace( '{region}', $region, $template );

		foreach ( $extra_fields as $name => $value ) {
			$template = str_replace( '{' . $name . '}', (string) $value, $template );
		}

		return $template;
	}

	/**
	 * Returns the canonical region for a preset, or null when the user
	 * is expected to supply one.
	 *
	 * @since 1.0.0
	 *
	 * @param string $id Preset ID.
	 *
	 * @return string|null
	 */
	public static function fixed_region( string $id ): ?string {
		$preset = self::get( $id );
		if ( null === $preset ) {
			return null;
		}
		return isset( $preset['region'] ) ? (string) $preset['region'] : null;
	}
}
