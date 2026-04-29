<?php
/**
 * Plugin Name:       Imagina Signatures
 * Plugin URI:        https://imaginawp.com/imagina-signatures
 * Description:       Professional email signatures for WordPress with a drag-and-drop editor, multi-user plans, and dual storage (Media Library or S3-compatible).
 * Version:           1.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Imagina WP
 * Author URI:        https://imaginawp.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       imagina-signatures
 * Domain Path:       /languages
 *
 * @package ImaginaSignatures
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( defined( 'IMGSIG_VERSION' ) ) {
	return;
}

define( 'IMGSIG_VERSION', '1.1.0' );
define( 'IMGSIG_PLUGIN_FILE', __FILE__ );
define( 'IMGSIG_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'IMGSIG_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'IMGSIG_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );
define( 'IMGSIG_MIN_PHP', '7.4' );
define( 'IMGSIG_MIN_WP', '6.0' );

require_once IMGSIG_PLUGIN_DIR . 'src/Core/Autoloader.php';
\ImaginaSignatures\Core\Autoloader::register();

register_activation_hook( __FILE__, [ \ImaginaSignatures\Core\Activator::class, 'activate' ] );
register_deactivation_hook( __FILE__, [ \ImaginaSignatures\Core\Deactivator::class, 'deactivate' ] );

add_action(
	'plugins_loaded',
	static function (): void {
		if ( version_compare( PHP_VERSION, IMGSIG_MIN_PHP, '<' ) ) {
			add_action(
				'admin_notices',
				static function (): void {
					echo '<div class="notice notice-error"><p>';
					printf(
						/* translators: %s: minimum PHP version. */
						esc_html__( 'Imagina Signatures requires PHP %s or higher.', 'imagina-signatures' ),
						esc_html( IMGSIG_MIN_PHP )
					);
					echo '</p></div>';
				}
			);
			return;
		}

		\ImaginaSignatures\Core\Plugin::instance()->boot();
	}
);

/**
 * Returns the main plugin instance.
 *
 * @since 1.0.0
 *
 * @return \ImaginaSignatures\Core\Plugin
 */
function imgsig_plugin(): \ImaginaSignatures\Core\Plugin {
	return \ImaginaSignatures\Core\Plugin::instance();
}
