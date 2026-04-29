<?php
/**
 * PSR-4 autoloader for the plugin.
 *
 * Maps the `ImaginaSignatures\` root namespace to the `src/` directory.
 * Designed to run without Composer at the buyer's runtime, per the project's
 * distribution constraints.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Custom PSR-4 autoloader.
 *
 * @since 1.0.0
 */
final class Autoloader {

	private const ROOT_NAMESPACE = 'ImaginaSignatures\\';

	/**
	 * Whether the autoloader has been registered.
	 *
	 * @var bool
	 */
	private static bool $registered = false;

	/**
	 * Registers the autoloader with SPL.
	 *
	 * Idempotent — safe to call multiple times.
	 *
	 * @since 1.0.0
	 */
	public static function register(): void {
		if ( self::$registered ) {
			return;
		}
		spl_autoload_register( [ self::class, 'load_class' ] );
		self::$registered = true;
	}

	/**
	 * Loads the file backing a fully-qualified class name.
	 *
	 * @since 1.0.0
	 *
	 * @param string $class_name Fully-qualified class name.
	 */
	public static function load_class( string $class_name ): void {
		if ( 0 !== strpos( $class_name, self::ROOT_NAMESPACE ) ) {
			return;
		}

		$relative   = substr( $class_name, strlen( self::ROOT_NAMESPACE ) );
		$path_parts = explode( '\\', $relative );
		$file_path  = IMGSIG_PLUGIN_DIR . 'src/' . implode( '/', $path_parts ) . '.php';

		if ( is_file( $file_path ) ) {
			require_once $file_path;
		}
	}
}
