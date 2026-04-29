<?php
/**
 * PSR-4 autoloader for the ImaginaSignatures namespace.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Tiny PSR-4 autoloader.
 *
 * The plugin avoids Composer at runtime (CLAUDE.md §2.1, §2.4) so we ship our
 * own loader. It maps the `ImaginaSignatures\` prefix to a base directory and
 * resolves child namespaces to subdirectories on disk.
 *
 * Example:
 *   `ImaginaSignatures\Storage\Drivers\S3Driver`
 *     -> `{base}/Storage/Drivers/S3Driver.php`
 *
 * The loader silently returns when a class doesn't belong to our prefix,
 * leaving other autoloaders (Composer's during development, WordPress core,
 * etc.) free to handle the request.
 *
 * @since 1.0.0
 */
final class Autoloader {

	/**
	 * Namespace prefix this loader is responsible for.
	 *
	 * Trailing backslash is required for PSR-4 prefix matching.
	 */
	private const PREFIX = 'ImaginaSignatures\\';

	/**
	 * Absolute path to the directory that contains the namespace root.
	 *
	 * @var string
	 */
	private string $base_dir;

	/**
	 * Whether the loader has already been registered with SPL.
	 *
	 * @var bool
	 */
	private static bool $registered = false;

	/**
	 * Registers the autoloader with SPL.
	 *
	 * Idempotent: subsequent calls are no-ops, even if the caller passes a
	 * different `$base_dir`. The first registration wins.
	 *
	 * @since 1.0.0
	 *
	 * @param string $base_dir Absolute path to the directory mapped to the
	 *                         `ImaginaSignatures\` prefix (typically `src/`).
	 *
	 * @return void
	 */
	public static function register( string $base_dir ): void {
		if ( self::$registered ) {
			return;
		}

		$loader = new self( $base_dir );
		spl_autoload_register( [ $loader, 'load' ] );
		self::$registered = true;
	}

	/**
	 * Constructor.
	 *
	 * @param string $base_dir Absolute path to the namespace root directory.
	 */
	private function __construct( string $base_dir ) {
		$this->base_dir = rtrim( $base_dir, DIRECTORY_SEPARATOR ) . DIRECTORY_SEPARATOR;
	}

	/**
	 * Attempts to load the file backing the given fully-qualified class name.
	 *
	 * Returns void per the SPL autoloader contract; missing files fall through
	 * so other autoloaders can take over.
	 *
	 * @since 1.0.0
	 *
	 * @param string $class_name Fully-qualified class, interface, or trait name.
	 *
	 * @return void
	 */
	public function load( string $class_name ): void {
		// Bail early when the class does not belong to our prefix.
		if ( 0 !== strncmp( $class_name, self::PREFIX, strlen( self::PREFIX ) ) ) {
			return;
		}

		$relative = substr( $class_name, strlen( self::PREFIX ) );
		$relative_path = str_replace( '\\', DIRECTORY_SEPARATOR, $relative ) . '.php';

		$file = $this->base_dir . $relative_path;

		if ( is_file( $file ) ) {
			require_once $file;
		}
	}
}
