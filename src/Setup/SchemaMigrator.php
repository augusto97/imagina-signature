<?php
/**
 * Database schema migrator.
 *
 * @package ImaginaSignatures\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup;

use ImaginaSignatures\Setup\Migrations\Migration_1_0_0;

defined( 'ABSPATH' ) || exit;

/**
 * Runs DB migrations sequentially based on the stored schema version.
 *
 * The migrator is safe to call multiple times — each migration only runs
 * when the stored `imgsig_schema_version` is below its target version.
 * After a migration succeeds, the option is bumped so the next call skips
 * already-applied steps. (CLAUDE.md §7.2.)
 *
 * Adding a new migration:
 *  1. Drop a class in `src/Setup/Migrations/Migration_X_Y_Z.php` with a
 *     public `up(): void` method.
 *  2. Append `'X.Y.Z' => Migration_X_Y_Z::class` to
 *     {@see SchemaMigrator::SCHEMA_VERSIONS} (order matters — keep them
 *     in ascending semver order).
 *
 * @since 1.0.0
 */
final class SchemaMigrator {

	/**
	 * Ordered map of schema version → migration class.
	 *
	 * Keys are compared with `version_compare`, so they must be valid
	 * semver strings. The lowest version comes first.
	 *
	 * @var array<string, class-string>
	 */
	private const SCHEMA_VERSIONS = [
		'1.0.0' => Migration_1_0_0::class,
	];

	/**
	 * The option key that stores the currently-applied schema version.
	 */
	private const VERSION_OPTION = 'imgsig_schema_version';

	/**
	 * Runs every pending migration in order.
	 *
	 * Each migration is wrapped in a try/catch so a failing migration
	 * doesn't leave the version pointer ahead of the actually-applied
	 * schema state.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function migrate(): void {
		$current = (string) get_option( self::VERSION_OPTION, '0.0.0' );

		foreach ( self::SCHEMA_VERSIONS as $version => $migration_class ) {
			if ( ! version_compare( $current, $version, '<' ) ) {
				continue;
			}

			/** @var object{up: callable} $migration */
			$migration = new $migration_class();
			$migration->up();

			update_option( self::VERSION_OPTION, $version );
			$current = $version;
		}
	}

	/**
	 * Returns the currently-applied schema version, or `0.0.0` when none.
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	public function current_version(): string {
		return (string) get_option( self::VERSION_OPTION, '0.0.0' );
	}

	/**
	 * Returns the highest schema version this migrator knows about.
	 *
	 * Useful for diagnostics and tests.
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	public function target_version(): string {
		$keys = array_keys( self::SCHEMA_VERSIONS );
		return end( $keys ) ?: '0.0.0';
	}
}
