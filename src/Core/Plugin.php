<?php
/**
 * Bootstrap singleton.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

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
	private function __construct() {}

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

		/**
		 * Fires once the plugin has finished booting.
		 *
		 * @since 1.0.0
		 */
		do_action( 'imgsig/plugin/booted' );
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
