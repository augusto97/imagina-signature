<?php
/**
 * Bootstrap singleton.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Admin\AdminMenu;
use ImaginaSignatures\Admin\Pages\SettingsPage;
use ImaginaSignatures\Hooks\Actions;
use ImaginaSignatures\Storage\StorageManager;

defined( 'ABSPATH' ) || exit;

/**
 * Main plugin class.
 *
 * Singleton that wires the dependency container and kicks off service
 * registration on `plugins_loaded`. Concrete service registration is added
 * in subsequent sprints (REST routes, admin pages, asset enqueuing).
 *
 * @since 1.0.0
 */
final class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;

	/**
	 * Whether {@see boot()} has already run.
	 *
	 * @var bool
	 */
	private bool $booted = false;

	/**
	 * Dependency injection container.
	 *
	 * @var Container
	 */
	private Container $container;

	/**
	 * Returns the singleton instance.
	 *
	 * @since 1.0.0
	 *
	 * @return self
	 */
	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor is private to enforce the singleton.
	 */
	private function __construct() {
		$this->container = new Container();
	}

	/**
	 * Returns the DI container.
	 *
	 * Service providers and tests can use this to register or override
	 * bindings.
	 *
	 * @since 1.0.0
	 *
	 * @return Container
	 */
	public function container(): Container {
		return $this->container;
	}

	/**
	 * Boots the plugin.
	 *
	 * Idempotent: calling it multiple times is a no-op after the first call.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function boot(): void {
		if ( $this->booted ) {
			return;
		}

		$this->booted = true;

		// Register core service bindings (Encryption, StorageManager).
		ServiceProvider::register( $this->container );

		// Admin-only wiring.
		if ( is_admin() ) {
			$this->boot_admin();
		}

		/**
		 * Fires once the plugin has finished booting.
		 *
		 * Service providers can hook in to register additional container
		 * bindings or WordPress hooks. The container instance is passed as
		 * the first argument.
		 *
		 * @since 1.0.0
		 *
		 * @param Container $container The plugin's DI container.
		 */
		do_action( Actions::PLUGIN_BOOTED, $this->container );
	}

	/**
	 * Wires the admin-only modules.
	 *
	 * Constructed lazily inside `is_admin()` so the front-end runtime
	 * never instantiates the admin classes.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private function boot_admin(): void {
		$storage_manager = $this->container->make( StorageManager::class );

		$settings_page = new SettingsPage( $storage_manager );
		$admin_menu    = new AdminMenu( $settings_page );
		$admin_menu->boot();
	}

	/**
	 * Returns the plugin version string.
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	public function version(): string {
		return defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '0.0.0';
	}

	/**
	 * Cloning is forbidden.
	 *
	 * @return void
	 */
	private function __clone() {}

	/**
	 * Unserializing is forbidden.
	 *
	 * @return void
	 *
	 * @throws \RuntimeException Always.
	 */
	public function __wakeup(): void {
		throw new \RuntimeException( 'Cannot unserialize ' . self::class );
	}
}
