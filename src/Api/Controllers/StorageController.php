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
	 * Empty `secret_key` in the payload means "keep the stored secret",
	 * matching the server-rendered Settings page semantics so the
	 * React UI can render an empty input without wiping credentials.
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
		$result = $this->manager->test_config( $driver_id, $config );

		return rest_ensure_response( $result->to_array() );
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

		// `secret_key`: empty/missing means keep the stored value.
		if ( empty( $incoming['secret_key'] ) && isset( $existing['secret_key'] ) ) {
			$incoming['secret_key'] = $existing['secret_key'];
		}

		return $incoming;
	}
}
