<?php
/**
 * Imagina Signatures uninstall hook.
 *
 * WordPress loads this file when the user deletes the plugin from
 * `Plugins → Deleted`. It must guard on `WP_UNINSTALL_PLUGIN`, register
 * the plugin's autoloader manually (the plugin's main file is NOT loaded
 * during uninstall), and delegate to `Uninstaller::uninstall()`.
 *
 * @package ImaginaSignatures
 */

declare(strict_types=1);

// Bail out unless WordPress is the one calling us.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// The main plugin file does not run during uninstall, so its constants are
// missing. Define just the paths the autoloader needs.
require_once __DIR__ . '/src/Core/Autoloader.php';
\ImaginaSignatures\Core\Autoloader::register( __DIR__ . '/src' );

\ImaginaSignatures\Core\Uninstaller::uninstall();
