<?php
/**
 * Connection presets for popular S3-compatible providers.
 *
 * @package ImaginaSignatures\Storage\S3
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage\S3;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Static catalog of provider presets.
 *
 * Presets only describe the connection shape; secrets and bucket names are
 * always supplied by the user.
 *
 * @since 1.0.0
 */
final class ProviderPresets {

	/**
	 * Returns every preset, keyed by identifier.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public static function all(): array {
		return [
			'cloudflare_r2' => [
				'name'              => 'Cloudflare R2',
				'endpoint_template' => 'https://{account_id}.r2.cloudflarestorage.com',
				'region'            => 'auto',
				'extra_fields'      => [ 'account_id' ],
				'path_style'        => true,
				'docs_url'          => 'https://docs.imaginawp.com/imagina-signatures/storage/cloudflare-r2',
			],
			'bunny'         => [
				'name'              => 'Bunny Storage',
				'endpoint_template' => 'https://{region}.storage.bunnycdn.com',
				'region_options'    => [ 'ny', 'la', 'sg', 'syd', 'de', 'uk' ],
				'path_style'        => true,
				'docs_url'          => 'https://docs.imaginawp.com/imagina-signatures/storage/bunny',
			],
			's3'            => [
				'name'              => 'Amazon S3',
				'endpoint_template' => 'https://s3.{region}.amazonaws.com',
				'region_options'    => [
					'us-east-1',
					'us-east-2',
					'us-west-1',
					'us-west-2',
					'eu-west-1',
					'eu-central-1',
					'ap-southeast-1',
					'ap-southeast-2',
					'ap-northeast-1',
					'sa-east-1',
				],
				'path_style'        => false,
				'docs_url'          => 'https://docs.imaginawp.com/imagina-signatures/storage/amazon-s3',
			],
			'b2'            => [
				'name'              => 'Backblaze B2',
				'endpoint_template' => 'https://s3.{region}.backblazeb2.com',
				'region_options'    => [ 'us-west-001', 'us-west-002', 'eu-central-003' ],
				'path_style'        => false,
				'docs_url'          => 'https://docs.imaginawp.com/imagina-signatures/storage/backblaze-b2',
			],
			'do_spaces'     => [
				'name'              => 'DigitalOcean Spaces',
				'endpoint_template' => 'https://{region}.digitaloceanspaces.com',
				'region_options'    => [ 'nyc3', 'sfo3', 'ams3', 'sgp1', 'fra1' ],
				'path_style'        => false,
				'docs_url'          => 'https://docs.imaginawp.com/imagina-signatures/storage/digitalocean-spaces',
			],
			'wasabi'        => [
				'name'              => 'Wasabi',
				'endpoint_template' => 'https://s3.{region}.wasabisys.com',
				'region_options'    => [ 'us-east-1', 'us-east-2', 'us-west-1', 'eu-central-1', 'ap-northeast-1' ],
				'path_style'        => false,
			],
			'minio'         => [
				'name'              => 'MinIO (self-hosted)',
				'endpoint_template' => '{custom}',
				'extra_fields'      => [ 'custom_endpoint' ],
				'path_style'        => true,
			],
			'custom'        => [
				'name'              => 'Custom S3-compatible',
				'endpoint_template' => '{custom}',
				'extra_fields'      => [ 'custom_endpoint' ],
				'path_style'        => true,
			],
		];
	}

	/**
	 * Resolves a single preset.
	 *
	 * @param string $id Preset identifier.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function get( string $id ): ?array {
		$all = self::all();
		return $all[ $id ] ?? null;
	}
}
