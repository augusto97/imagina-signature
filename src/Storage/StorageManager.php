<?php
/**
 * Factory that resolves the active storage driver.
 *
 * @package ImaginaSignatures\Storage
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage;

use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Storage\Contracts\StorageDriverInterface;
use ImaginaSignatures\Storage\Drivers\MediaLibraryDriver;
use ImaginaSignatures\Storage\Drivers\S3Driver;
use ImaginaSignatures\Storage\S3\BucketConfig;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Resolves and caches the active driver instance.
 *
 * Reads `imgsig_storage_driver` and `imgsig_storage_config` from WP options.
 * S3 credentials are encrypted at rest; this manager handles decryption.
 *
 * @since 1.0.0
 */
final class StorageManager {

	private Encryption $encryption;
	private ?StorageDriverInterface $driver = null;

	/**
	 * @param Encryption $encryption Crypto helper.
	 */
	public function __construct( Encryption $encryption ) {
		$this->encryption = $encryption;
	}

	/**
	 * Returns the active driver, instantiating it on first access.
	 *
	 * @return StorageDriverInterface
	 */
	public function get_active_driver(): StorageDriverInterface {
		if ( null === $this->driver ) {
			$this->driver = $this->build_driver( (string) get_option( 'imgsig_storage_driver', 'media_library' ) );
		}
		return $this->driver;
	}

	/**
	 * Forgets the cached driver. Call after changing config.
	 *
	 * @return void
	 */
	public function reset(): void {
		$this->driver = null;
	}

	/**
	 * Returns a driver by id without caching.
	 *
	 * @param string $driver_id Driver identifier.
	 *
	 * @return StorageDriverInterface
	 */
	public function build_driver( string $driver_id ): StorageDriverInterface {
		switch ( $driver_id ) {
			case 's3':
				return new S3Driver( BucketConfig::from_array( $this->decrypt_config() ) );
			case 'media_library':
			default:
				return new MediaLibraryDriver();
		}
	}

	/**
	 * Returns the decrypted storage config (or an empty array).
	 *
	 * @return array<string, mixed>
	 */
	public function decrypt_config(): array {
		$raw = get_option( 'imgsig_storage_config', [] );
		if ( is_array( $raw ) ) {
			return $raw; // never encrypted (legacy or empty).
		}
		if ( is_string( $raw ) && '' !== $raw ) {
			try {
				return $this->encryption->decrypt_array( $raw );
			} catch ( \Throwable $e ) {
				return [];
			}
		}
		return [];
	}

	/**
	 * Persists an encrypted config payload.
	 *
	 * @param array<string, mixed> $config Decrypted values.
	 *
	 * @return void
	 */
	public function save_config( array $config ): void {
		$encoded = $this->encryption->encrypt_array( $config );
		update_option( 'imgsig_storage_config', $encoded, false );
		$this->reset();
	}
}
