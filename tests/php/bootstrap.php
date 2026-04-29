<?php
/**
 * PHPUnit bootstrap.
 *
 * Loads the plugin autoloader so unit tests can use the production classes
 * without depending on a full WordPress test environment. Integration tests
 * that need WordPress should bootstrap it themselves via Brain Monkey.
 *
 * @package ImaginaSignatures\Tests
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

if ( ! defined( 'IMGSIG_PLUGIN_DIR' ) ) {
	define( 'IMGSIG_PLUGIN_DIR', dirname( __DIR__, 2 ) . '/' );
}

if ( ! defined( 'IMGSIG_VERSION' ) ) {
	define( 'IMGSIG_VERSION', '1.0.0' );
}

if ( ! defined( 'IMGSIG_PLUGIN_BASENAME' ) ) {
	define( 'IMGSIG_PLUGIN_BASENAME', 'imagina-signatures/imagina-signatures.php' );
}

if ( ! defined( 'IMGSIG_MIN_PHP' ) ) {
	define( 'IMGSIG_MIN_PHP', '7.4' );
}

if ( ! defined( 'IMGSIG_MIN_WP' ) ) {
	define( 'IMGSIG_MIN_WP', '6.0' );
}

require_once dirname( __DIR__, 2 ) . '/src/Core/Autoloader.php';
\ImaginaSignatures\Core\Autoloader::register();

$composer_autoload = dirname( __DIR__, 2 ) . '/vendor/autoload.php';
if ( file_exists( $composer_autoload ) ) {
	require_once $composer_autoload;
}
