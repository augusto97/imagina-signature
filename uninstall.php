<?php
/**
 * Uninstall handler.
 *
 * Fires when the user deletes the plugin from the WordPress admin.
 * Delegates cleanup to the Uninstaller class so the logic stays testable.
 *
 * @package ImaginaSignatures
 */

declare(strict_types=1);

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

require_once __DIR__ . '/src/Core/Autoloader.php';
\ImaginaSignatures\Core\Autoloader::register();

\ImaginaSignatures\Core\Uninstaller::uninstall();
