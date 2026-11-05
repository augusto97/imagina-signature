<?php
/**
 * Storage configuration endpoints (admin).
 *
 * @package ImaginaSignatures\Api\Controllers
 */

declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

use ImaginaSignatures\Api\BaseController;
use ImaginaSignatures\Api\Middleware\CapabilityCheck;
use ImaginaSignatures\Exceptions\ImaginaSignaturesException;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Storage\Drivers\S3Driver;
use ImaginaSignatures\Storage\S3\ProviderPresets;
use ImaginaSignatures\Storage\StorageManager;

defined( 'ABSPATH' ) || exit;

/**
 * Storage settings endpoints exposed at `/admin/storage`.
 *
 * Mirrors the operations the server-rendered Settings page already
 * does (CLAUDE.md §16.2):
 *  - `GET    /admin/storage`         — read current state (no secrets).
 *  - `PATCH  /admin/storage`         — write a new configuration.
 *  - `POST   /admin/storage/test`    — probe a draft configuration.
 *
 * Migration (`POST /admin/storage/migrate`) is intentionally NOT
 * implemented in Sprint 3: the migrator runs as a long task and needs
 * its own scheduling story (Action Scheduler / WP-Cron).
 *
 * @since 1.0.0
 */
final class StorageController extends BaseController {

	/**
	 * Field names we never send back over the wire.
	 *
	 * @var string[]
	 */
	private const SECRET_FIELDS = [ 'access_key', 'secret_key' ];

	/**
	 * @var StorageManager
	 */
	private StorageManager $manager;

	/**
	 * @param StorageManager $manager Storage manager.
	 */
	public function __construct( StorageManager $manager ) {
		$this->manager = $manager;
	}

	/**
	 * @inheritDoc
	 */
	public function register_routes(): void {
		$require_manage = CapabilityCheck::require_capability( CapabilitiesInstaller::CAP_MANAGE_STORAGE );

		register_rest_route(
			self::NAMESPACE,
			'/admin/storage',
			[
				[
					'methods'             => 'GET',
					'callback'            => [ $this, 'show' ],
					'permission_callback' => $require_manage,
				],
				[
					// `EDITABLE` = POST | PUT | PATCH — defends against
					// hosting WAFs that strip PATCH at the proxy layer.
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => [ $this, 'update' ],
					'permission_callback' => $require_manage,
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/storage/test',
			[
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'test' ],
					'permission_callback' => $require_manage,
				],
			]
		);
	}

	/**
	 * `GET /admin/storage` — current state with secrets redacted.
	 *
	 * Returns `has_secret_key` / `has_access_key` booleans instead of
	 * the secrets themselves so the React UI can show a "(stored)"
	 * indicator without ever holding the value.
	 *
	 * @since 1.0.0
	 *
	 * @return \WP_REST_Response
	 */
	public function show(): \WP_REST_Response {
		$config = $this->manager->read_active_config();

		return rest_ensure_response(
			[
				'driver'         => $this->manager->active_driver_id(),
				'available'      => $this->manager->available_driver_ids(),
				'config'         => $this->redact( $config ),
				'has_access_key' => ! empty( $config['access_key'] ),
				'has_secret_key' => ! empty( $config['secret_key'] ),
			]
		);
	}

	/**
	 * `PATCH /admin/storage` — persist a new configuration.
	 *
	 * Empty `secret_key` / `access_key` in the payload means "keep the
	 * stored value", matching the server-rendered Settings page
	 * semantics so the React UI can render an empty input without
	 * wiping credentials.
	 *
	 * An S3 configuration is validated (provider, bucket, region /
	 * account id `[a-z0-9-]`, http(s) endpoints) and must pass a live
	 * connection test before it is saved — a broken config is refused
	 * with 400 instead of silently breaking every upload.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update( \WP_REST_Request $request ) {
		$driver_id = (string) $request->get_param( 'driver' );
		$incoming  = $request->get_param( 'config' );
		$incoming  = is_array( $incoming ) ? $incoming : [];

		$config = $this->merge_with_existing( $driver_id, $incoming );

		if ( S3Driver::ID === $driver_id ) {
			$invalid = $this->validate_s3_config( $config );
			if ( null !== $invalid ) {
				return $invalid;
			}

			$result = $this->manager->test_config( $driver_id, $config );
			if ( ! $result->success ) {
				return new \WP_Error(
					'imgsig_storage_test_failed',
					sprintf(
						/* translators: %s: connection test failure message. */
						__( 'The storage settings were not saved because the connection test failed: %s', 'imagina-signatures' ),
						$result->message
					),
					[
						'status' => 400,
						'test'   => $result->to_array(),
					]
				);
			}
		}

		try {
			$this->manager->save_config( $driver_id, $config );
		} catch ( ImaginaSignaturesException $e ) {
			return $this->exception_to_wp_error( $e );
		}

		return $this->show();
	}

	/**
	 * `POST /admin/storage/test` — probe a draft configuration.
	 *
	 * Same secret-preservation logic as {@see update()}: an empty
	 * `secret_key` in the payload falls back to the stored value.
	 *
	 * @since 1.0.0
	 *
	 * @param \WP_REST_Request $request Inbound.
	 *
	 * @return \WP_REST_Response
	 */
	public function test( \WP_REST_Request $request ): \WP_REST_Response {
		$driver_id = (string) $request->get_param( 'driver' );
		$incoming  = $request->get_param( 'config' );
		$incoming  = is_array( $incoming ) ? $incoming : [];

		$config = $this->merge_with_existing( $driver_id, $incoming );

		if ( S3Driver::ID === $driver_id ) {
			$invalid = $this->validate_s3_config( $config );
			if ( null !== $invalid ) {
				return rest_ensure_response(
					[
						'success' => false,
						'message' => $invalid->get_error_message(),
						'details' => [
							'reason' => 'config_invalid',
							'errors' => $invalid->get_error_data()['errors'] ?? [],
						],
					]
				);
			}
		}

		$result = $this->manager->test_config( $driver_id, $config );

		return rest_ensure_response( $result->to_array() );
	}

	/**
	 * Validates (and normalises in place) an S3 configuration.
	 *
	 * @since 1.0.40
	 *
	 * @param array<string, mixed> $config Merged config; trimmed in place.
	 *
	 * @return \WP_Error|null 400 error listing invalid fields, or null.
	 */
	private function validate_s3_config( array &$config ): ?\WP_Error {
		foreach ( [ 'provider', 'bucket', 'region', 'account_id', 'access_key', 'secret_key', 'custom_endpoint', 'public_url_base' ] as $field ) {
			if ( isset( $config[ $field ] ) ) {
				$config[ $field ] = trim( (string) $config[ $field ] );
			}
		}

		$errors   = [];
		$provider = (string) ( $config['provider'] ?? '' );

		if ( ! ProviderPresets::exists( $provider ) ) {
			$errors[] = [
				'path'    => 'provider',
				'message' => __( 'Unknown storage provider.', 'imagina-signatures' ),
			];
		}

		if ( ! preg_match( '/^[A-Za-z0-9][A-Za-z0-9._\-]{1,254}$/', (string) ( $config['bucket'] ?? '' ) ) ) {
			$errors[] = [
				'path'    => 'bucket',
				'message' => __( 'Bucket names may only contain letters, numbers, dots, dashes and underscores.', 'imagina-signatures' ),
			];
		}

		// Region and account id are interpolated into endpoint host names.
		foreach ( [ 'region', 'account_id' ] as $field ) {
			if ( isset( $config[ $field ] ) && '' !== $config[ $field ] && ! preg_match( '/^[a-z0-9-]{1,63}$/', (string) $config[ $field ] ) ) {
				$errors[] = [
					'path'    => $field,
					'message' => __( 'Only lowercase letters, numbers and dashes are allowed.', 'imagina-signatures' ),
				];
			}
		}

		if ( 'cloudflare_r2' === $provider && '' === (string) ( $config['account_id'] ?? '' ) ) {
			$errors[] = [
				'path'    => 'account_id',
				'message' => __( 'Cloudflare R2 needs your account id.', 'imagina-signatures' ),
			];
		}

		foreach ( [ 'access_key', 'secret_key' ] as $field ) {
			$value = (string) ( $config[ $field ] ?? '' );
			if ( '' === $value || preg_match( '/[\s\x00-\x1F\x7F]/', $value ) ) {
				$errors[] = [
					'path'    => $field,
					'message' => __( 'This credential is missing or contains whitespace.', 'imagina-signatures' ),
				];
			}
		}

		foreach ( [ 'custom_endpoint', 'public_url_base' ] as $field ) {
			$value = (string) ( $config[ $field ] ?? '' );
			if ( '' === $value ) {
				if ( 'custom_endpoint' === $field && 'custom' === $provider ) {
					$errors[] = [
						'path'    => $field,
						'message' => __( 'A custom endpoint URL is required.', 'imagina-signatures' ),
					];
				}
				continue;
			}

			$parts = wp_parse_url( $value );
			if ( ! is_array( $parts ) || empty( $parts['host'] ) || ! in_array( strtolower( (string) ( $parts['scheme'] ?? '' ) ), [ 'http', 'https' ], true )
				|| isset( $parts['query'] ) || isset( $parts['fragment'] ) || isset( $parts['user'] ) || preg_match( '/[\s"\'<>]/', $value ) ) {
				$errors[] = [
					'path'    => $field,
					'message' => __( 'Enter a full http(s):// URL without query string or credentials.', 'imagina-signatures' ),
				];
				continue;
			}

			$config[ $field ] = untrailingslashit( $value );
		}

		if ( empty( $errors ) ) {
			return null;
		}

		return new \WP_Error(
			'imgsig_storage_invalid',
			__( 'Some storage settings are invalid.', 'imagina-signatures' ),
			[
				'status' => 400,
				'errors' => $errors,
			]
		);
	}

	/**
	 * Strips secret fields from a config map before sending it over the wire.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $config Source config.
	 *
	 * @return array<string, mixed>
	 */
	private function redact( array $config ): array {
		foreach ( self::SECRET_FIELDS as $field ) {
			unset( $config[ $field ] );
		}
		return $config;
	}

	/**
	 * Folds an incoming config payload over the currently-stored one,
	 * preserving the existing `secret_key` when the caller sent an
	 * empty value.
	 *
	 * @since 1.0.0
	 *
	 * @param string               $driver_id  Driver ID for the new config.
	 * @param array<string, mixed> $incoming   Incoming payload.
	 *
	 * @return array<string, mixed>
	 */
	private function merge_with_existing( string $driver_id, array $incoming ): array {
		// Anything other than S3 has no merge semantics — the driver
		// stores nothing in the config blob.
		if ( S3Driver::ID !== $driver_id ) {
			return $incoming;
		}

		$existing = $this->manager->read_active_config();

		// Credentials: empty/missing means keep the stored value (the GET
		// response never includes them, so the UI can't echo them back).
		foreach ( [ 'secret_key', 'access_key' ] as $field ) {
			if ( empty( $incoming[ $field ] ) && isset( $existing[ $field ] ) ) {
				$incoming[ $field ] = $existing[ $field ];
			}
		}

		return $incoming;
	}
}
