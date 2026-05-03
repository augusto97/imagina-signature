<?php
/**
 * Storage manager — driver factory and configuration I/O.
 *
 * @package ImaginaSignatures\Storage
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage;

use ImaginaSignatures\Exceptions\StorageException;
use ImaginaSignatures\Hooks\Actions;
use ImaginaSignatures\Hooks\Filters;
use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Storage\Contracts\StorageDriverInterface;
use ImaginaSignatures\Storage\Dto\TestResult;
use ImaginaSignatures\Storage\Drivers\MediaLibraryDriver;
use ImaginaSignatures\Storage\Drivers\S3Driver;
use ImaginaSignatures\Storage\Drivers\UrlOnlyDriver;

defined( 'ABSPATH' ) || exit;

/**
 * Builds and caches the active storage driver based on the persisted
 * options `imgsig_storage_driver` and `imgsig_storage_config` (CLAUDE.md §17).
 *
 * The manager is the single entry point the rest of the plugin uses to
 * read/write assets — controllers, services, and the editor never
 * instantiate drivers directly. Caching is per-request: once
 * {@see active_driver()} resolves a driver it's reused until
 * {@see save_config()} mutates the configuration.
 *
 * Configuration round-trip:
 *
 *   1. {@see save_config()} JSON-encodes the config, encrypts via
 *      {@see Encryption}, and persists the encrypted blob to the
 *      `imgsig_storage_config` option.
 *   2. {@see read_active_config()} loads, decrypts, and decodes — never
 *      surfaces a partial or null shape (returns an empty array on any
 *      failure so callers don't have to handle three states).
 *
 * @since 1.0.0
 */
final class StorageManager {

	/**
	 * Option key for the active driver ID.
	 */
	public const OPTION_DRIVER = 'imgsig_storage_driver';

	/**
	 * Option key for the encrypted driver configuration blob.
	 */
	public const OPTION_CONFIG = 'imgsig_storage_config';

	/**
	 * Encryption service used for round-tripping the config blob.
	 *
	 * @var Encryption
	 */
	private Encryption $encryption;

	/**
	 * Resolved driver instance, cached for the request lifetime.
	 *
	 * @var StorageDriverInterface|null
	 */
	private ?StorageDriverInterface $cached_driver = null;

	/**
	 * Identifier the cached driver was built for (used to invalidate).
	 *
	 * @var string|null
	 */
	private ?string $cached_driver_id = null;

	/**
	 * @param Encryption $encryption Encryption service for the config blob.
	 */
	public function __construct( Encryption $encryption ) {
		$this->encryption = $encryption;
	}

	/**
	 * Returns the currently-active storage driver.
	 *
	 * Lazy: the driver is built once and reused. Throws when the
	 * persisted configuration cannot be decoded into a working driver
	 * (e.g. user selected S3 but the credentials are missing) — by
	 * design, since silently falling back to a different driver could
	 * route private uploads to the wrong backend.
	 *
	 * @since 1.0.0
	 *
	 * @return StorageDriverInterface
	 *
	 * @throws StorageException When the configured driver cannot be built.
	 */
	public function active_driver(): StorageDriverInterface {
		$driver_id = $this->active_driver_id();

		if ( null !== $this->cached_driver && $this->cached_driver_id === $driver_id ) {
			return $this->cached_driver;
		}

		$driver = $this->build_driver( $driver_id, $this->read_active_config() );

		$this->cached_driver    = $driver;
		$this->cached_driver_id = $driver_id;

		return $driver;
	}

	/**
	 * Returns the ID of the currently-active driver.
	 *
	 * Falls back to {@see MediaLibraryDriver::ID} when the persisted ID
	 * is unknown (e.g. an extension that registered a custom driver was
	 * deactivated).
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	public function active_driver_id(): string {
		$id = (string) get_option( self::OPTION_DRIVER, MediaLibraryDriver::ID );
		return in_array( $id, $this->available_driver_ids(), true )
			? $id
			: MediaLibraryDriver::ID;
	}

	/**
	 * Returns the IDs of every driver available for selection.
	 *
	 * Third parties can register additional drivers via the
	 * {@see Filters::STORAGE_AVAILABLE_DRIVERS} filter. Note: registering
	 * an ID alone does not make it constructible — extensions must also
	 * extend {@see build_driver()} via the same code path or replace
	 * the manager binding in the DI container.
	 *
	 * @since 1.0.0
	 *
	 * @return string[]
	 */
	public function available_driver_ids(): array {
		$ids = [ MediaLibraryDriver::ID, S3Driver::ID, UrlOnlyDriver::ID ];

		/**
		 * Filters the list of available storage driver IDs.
		 *
		 * @since 1.0.0
		 *
		 * @param string[] $ids Default list.
		 */
		$filtered = apply_filters( Filters::STORAGE_AVAILABLE_DRIVERS, $ids );
		return is_array( $filtered ) ? array_values( array_unique( array_map( 'strval', $filtered ) ) ) : $ids;
	}

	/**
	 * Builds a fresh driver instance without persisting or caching.
	 *
	 * Used by {@see test_config()} so the settings page can probe a
	 * draft configuration before the admin commits it. Bypasses the
	 * cache entirely.
	 *
	 * @since 1.0.0
	 *
	 * @param string               $id     Driver identifier.
	 * @param array<string, mixed> $config Driver configuration (decrypted).
	 *
	 * @return StorageDriverInterface
	 *
	 * @throws StorageException When `$id` is unknown or the config is invalid.
	 */
	public function build_driver( string $id, array $config = [] ): StorageDriverInterface {
		switch ( $id ) {
			case MediaLibraryDriver::ID:
				return new MediaLibraryDriver();

			case S3Driver::ID:
				return S3Driver::from_config( $config );

			case UrlOnlyDriver::ID:
				// URL-only mode takes no configuration — every
				// upload throws `StorageException` so the editor's
				// `uploadEnabled = false` flag is the actual UX
				// gate. See {@see UrlOnlyDriver}.
				return new UrlOnlyDriver();

			default:
				throw new StorageException( sprintf( 'Unknown storage driver: "%s".', $id ) );
		}
	}

	/**
	 * Decrypts and decodes the currently-persisted configuration.
	 *
	 * Returns an empty array on any failure (missing option, decryption
	 * error, malformed JSON) — by design, so callers never have to
	 * branch on null vs empty array vs invalid shape.
	 *
	 * @since 1.0.0
	 *
	 * @return array<string, mixed>
	 */
	public function read_active_config(): array {
		$encoded = (string) get_option( self::OPTION_CONFIG, '' );
		if ( '' === $encoded ) {
			return [];
		}

		try {
			$plaintext = $this->encryption->decrypt( $encoded );
		} catch ( \Throwable $e ) {
			return [];
		}

		if ( '' === $plaintext ) {
			return [];
		}

		$decoded = json_decode( $plaintext, true );
		return is_array( $decoded ) ? $decoded : [];
	}

	/**
	 * Persists a new active driver and configuration atomically.
	 *
	 * The configuration JSON-encodes, encrypts, and writes to the
	 * `imgsig_storage_config` option; the driver ID writes to
	 * `imgsig_storage_driver`. Cache is reset so the next
	 * {@see active_driver()} call sees the new state. Fires
	 * {@see Actions::STORAGE_DRIVER_CHANGED} when the driver ID
	 * actually changes.
	 *
	 * @since 1.0.0
	 *
	 * @param string               $driver_id Driver identifier.
	 * @param array<string, mixed> $config    Driver configuration (plaintext).
	 *
	 * @return void
	 *
	 * @throws StorageException When `$driver_id` is not in the available list.
	 */
	public function save_config( string $driver_id, array $config ): void {
		if ( ! in_array( $driver_id, $this->available_driver_ids(), true ) ) {
			throw new StorageException( sprintf( 'Driver "%s" is not registered.', $driver_id ) );
		}

		$previous_id = $this->active_driver_id();

		$encoded = '';
		if ( ! empty( $config ) ) {
			$json    = wp_json_encode( $config );
			$encoded = is_string( $json ) ? $this->encryption->encrypt( $json ) : '';
		}

		// `autoload = false` for the encrypted secrets blob — there's
		// no reason to load S3 credentials into `alloptions` cache on
		// every page load. Until 1.0.25 this used the default
		// (`autoload = true`), which kept the encrypted blob in the
		// permanent options cache for every request.
		update_option( self::OPTION_CONFIG, $encoded, false );
		update_option( self::OPTION_DRIVER, $driver_id );

		// Invalidate the cached driver so the next call rebuilds.
		$this->cached_driver    = null;
		$this->cached_driver_id = null;

		if ( $previous_id !== $driver_id ) {
			/**
			 * Fires when the active storage driver changes.
			 *
			 * @since 1.0.0
			 *
			 * @param string $previous_id Previously-active driver ID.
			 * @param string $new_id      Newly-active driver ID.
			 */
			do_action( Actions::STORAGE_DRIVER_CHANGED, $previous_id, $driver_id );
		}
	}

	/**
	 * Probes a draft configuration without persisting it.
	 *
	 * Used by the settings page "Test connection" button. Construction
	 * failures (missing fields, unknown preset) are translated into a
	 * {@see TestResult::failure()} so the UI has a single rendering
	 * code path.
	 *
	 * @since 1.0.0
	 *
	 * @param string               $driver_id Driver identifier.
	 * @param array<string, mixed> $config    Draft configuration.
	 *
	 * @return TestResult
	 */
	public function test_config( string $driver_id, array $config ): TestResult {
		try {
			$driver = $this->build_driver( $driver_id, $config );
		} catch ( StorageException $e ) {
			return TestResult::failure(
				$e->getMessage(),
				[ 'reason' => 'config_invalid' ]
			);
		}

		return $driver->test_connection();
	}
}
