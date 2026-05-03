<?php
/**
 * Plugin Name:       Imagina Signatures
 * Plugin URI:        https://github.com/augusto97/imagina-signature
 * Description:       Visual email signature editor for WordPress with an isolated React 18 iframe editor and S3-compatible storage.
 * Version:           1.0.31
 * Requires at least: 6.0
 * Tested up to:      6.7
 * Requires PHP:      7.4
 * Author:            Imagina WP
 * Author URI:        https://imagina.wp
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       imagina-signatures
 * Domain Path:       /languages
 *
 * @package ImaginaSignatures
 */

declare(strict_types=1);

namespace ImaginaSignatures;

use ImaginaSignatures\Core\Activator;
use ImaginaSignatures\Core\Autoloader;
use ImaginaSignatures\Core\Deactivator;
use ImaginaSignatures\Core\Plugin;

defined( 'ABSPATH' ) || exit;

/*
 * -----------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------
 */

define( 'IMGSIG_VERSION', '1.0.31' );
define( 'IMGSIG_FILE', __FILE__ );
define( 'IMGSIG_PATH', plugin_dir_path( __FILE__ ) );
define( 'IMGSIG_URL', plugin_dir_url( __FILE__ ) );
define( 'IMGSIG_BASENAME', plugin_basename( __FILE__ ) );
define( 'IMGSIG_MIN_PHP', '7.4' );
define( 'IMGSIG_MIN_WP', '6.0' );

/*
 * -----------------------------------------------------------------------------
 * Environment checks
 * -----------------------------------------------------------------------------
 *
 * If PHP or WordPress versions are too old, we abort early and show an admin
 * notice. Doing this here (before any namespaced code loads) keeps the plugin
 * file parseable on PHP 5.x just long enough to deliver the message.
 */

/**
 * Returns true if the host environment meets the plugin's minimum requirements.
 *
 * @since 1.0.0
 *
 * @return bool
 */
function imgsig_meets_requirements(): bool {
	global $wp_version;

	if ( version_compare( PHP_VERSION, IMGSIG_MIN_PHP, '<' ) ) {
		return false;
	}

	if ( isset( $wp_version ) && version_compare( $wp_version, IMGSIG_MIN_WP, '<' ) ) {
		return false;
	}

	return true;
}

/**
 * Renders an admin notice when the environment is unsupported.
 *
 * @since 1.0.0
 *
 * @return void
 */
function imgsig_render_unsupported_notice(): void {
	if ( ! current_user_can( 'activate_plugins' ) ) {
		return;
	}

	$message = sprintf(
		/* translators: 1: plugin name, 2: minimum PHP version, 3: minimum WP version. */
		esc_html__( '%1$s requires PHP %2$s or higher and WordPress %3$s or higher. The plugin has been deactivated.', 'imagina-signatures' ),
		'<strong>Imagina Signatures</strong>',
		esc_html( IMGSIG_MIN_PHP ),
		esc_html( IMGSIG_MIN_WP )
	);

	echo '<div class="notice notice-error"><p>' . wp_kses_post( $message ) . '</p></div>';
}

if ( ! imgsig_meets_requirements() ) {
	add_action( 'admin_notices', __NAMESPACE__ . '\\imgsig_render_unsupported_notice' );
	add_action(
		'admin_init',
		static function (): void {
			deactivate_plugins( IMGSIG_BASENAME );
		}
	);
	return;
}

/*
 * -----------------------------------------------------------------------------
 * Autoloader
 * -----------------------------------------------------------------------------
 *
 * The plugin ships with a tiny PSR-4 autoloader (no Composer in runtime,
 * see CLAUDE.md §2.1 / §5.8). It registers the `ImaginaSignatures\` prefix
 * against the `src/` directory.
 */

require_once IMGSIG_PATH . 'src/Core/Autoloader.php';
Autoloader::register( IMGSIG_PATH . 'src' );

/*
 * -----------------------------------------------------------------------------
 * Lifecycle hooks
 * -----------------------------------------------------------------------------
 *
 * Uninstall is handled by the separate uninstall.php file (WordPress loads it
 * when the user deletes the plugin), not by a hook here. Activation and
 * deactivation must run synchronously and have access to the full namespace,
 * so we register them here.
 */

register_activation_hook( IMGSIG_FILE, [ Activator::class, 'activate' ] );
register_deactivation_hook( IMGSIG_FILE, [ Deactivator::class, 'deactivate' ] );

/*
 * -----------------------------------------------------------------------------
 * Bootstrap
 * -----------------------------------------------------------------------------
 *
 * `Plugin::instance()->boot()` wires the DI container, registers REST routes,
 * admin pages, and asset enqueuing. We hook into `plugins_loaded` so all other
 * plugins/themes/core are available, and any extender can rely on a
 * predictable load order.
 */

add_action(
	'plugins_loaded',
	static function (): void {
		Plugin::instance()->boot();
	}
);
