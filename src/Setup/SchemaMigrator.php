<?php
/**
 * Schema migration runner.
 *
 * @package ImaginaSignatures\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup;

use ImaginaSignatures\Setup\Migrations\Migration_1_0_0;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Applies versioned database migrations on activation and on every boot.
 *
 * Each migration class lives under `src/Setup/Migrations/` and is responsible
 * for making the schema match a specific plugin version. The migrator stores
 * the last applied version in the `imgsig_schema_version` option and only
 * runs migrations whose target version is strictly greater.
 *
 * @since 1.0.0
 */
final class SchemaMigrator {

	/**
	 * Ordered map of `version => migration class`.
	 *
	 * Entries must be ordered ascending by version. Future migrations append
	 * to the end of the list.
	 *
	 * @var array<string, class-string>
	 */
	private const MIGRATIONS = [
		'1.0.0' => Migration_1_0_0::class,
	];

	/**
	 * Runs every pending migration.
	 *
	 * @since 1.0.0
	 */
	public function migrate(): void {
		$current = (string) get_option( 'imgsig_schema_version', '0.0.0' );

		foreach ( self::MIGRATIONS as $version => $migration_class ) {
			if ( version_compare( $current, $version, '<' ) ) {
				/** @var object{up: callable} $migration */
				$migration = new $migration_class();
				$migration->up();
				update_option( 'imgsig_schema_version', $version, false );
				$current = $version;

				/**
				 * Fires after a schema migration has been applied.
				 *
				 * @since 1.0.0
				 *
				 * @param string $version Target version that was just applied.
				 */
				do_action( 'imgsig/schema/migrated', $version );
			}
		}
	}

	/**
	 * Returns the latest migration version known to this build.
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	public function latest_version(): string {
		$keys = array_keys( self::MIGRATIONS );
		return (string) end( $keys );
	}
}
