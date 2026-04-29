<?php
/**
 * Plugin bootstrap singleton.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Top-level plugin coordinator.
 *
 * Owns the DI container and triggers the lifecycle hooks expected by other
 * subsystems. Sprint 1 keeps this minimal — later sprints will register the
 * admin pages, REST API, and frontend assets here.
 *
 * @since 1.0.0
 */
final class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static ?Plugin $instance = null;

	/**
	 * Service container.
	 *
	 * @var Container
	 */
	private Container $container;

	/**
	 * Whether `boot()` has already executed.
	 *
	 * @var bool
	 */
	private bool $booted = false;

	/**
	 * Use the named constructor `instance()` instead.
	 */
	private function __construct() {
		$this->container = new Container();
	}

	/**
	 * Returns the singleton instance.
	 *
	 * @since 1.0.0
	 *
	 * @return Plugin
	 */
	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Returns the DI container.
	 *
	 * @since 1.0.0
	 *
	 * @return Container
	 */
	public function container(): Container {
		return $this->container;
	}

	/**
	 * Bootstraps the plugin.
	 *
	 * Idempotent — safe to invoke more than once. Runs after `plugins_loaded`
	 * so all WordPress core APIs are available.
	 *
	 * @since 1.0.0
	 */
	public function boot(): void {
		if ( $this->booted ) {
			return;
		}
		$this->booted = true;

		$this->load_textdomain();
		$this->run_pending_migrations();

		/**
		 * Fires after the plugin has finished bootstrapping.
		 *
		 * @since 1.0.0
		 *
		 * @param Plugin $plugin The plugin instance.
		 */
		do_action( 'imgsig/plugin/booted', $this );
	}

	/**
	 * Loads the plugin translations.
	 *
	 * @since 1.0.0
	 */
	private function load_textdomain(): void {
		load_plugin_textdomain(
			'imagina-signatures',
			false,
			dirname( IMGSIG_PLUGIN_BASENAME ) . '/languages'
		);
	}

	/**
	 * Runs pending schema migrations on every boot.
	 *
	 * The migrator is version-gated: if the stored schema version matches the
	 * code version, no work is performed. This keeps the upgrade path safe
	 * even when `register_activation_hook` is bypassed (multisite, WP-CLI).
	 *
	 * @since 1.0.0
	 */
	private function run_pending_migrations(): void {
		( new \ImaginaSignatures\Setup\SchemaMigrator() )->migrate();
	}

	/**
	 * Magic clone is forbidden — singleton.
	 */
	public function __clone() {
		throw new \LogicException( 'Cloning the Plugin singleton is not allowed.' );
	}

	/**
	 * Magic wakeup is forbidden — singleton.
	 */
	public function __wakeup(): void {
		throw new \LogicException( 'Unserializing the Plugin singleton is not allowed.' );
	}
}
