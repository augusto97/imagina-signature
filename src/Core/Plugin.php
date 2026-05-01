<?php
/**
 * Bootstrap singleton.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Admin\AdminAppPage;
use ImaginaSignatures\Admin\AdminMenu;
use ImaginaSignatures\Admin\Pages\EditorPage;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Api\Controllers\AssetsController;
use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Api\Controllers\MeController;
use ImaginaSignatures\Api\Controllers\SignaturesController;
use ImaginaSignatures\Api\Controllers\StorageController;
use ImaginaSignatures\Api\Controllers\TemplatesController;
use ImaginaSignatures\Api\Controllers\UploadController;
use ImaginaSignatures\Api\RestRouter;
use ImaginaSignatures\Hooks\Actions;
use ImaginaSignatures\Repositories\SignatureRepository;

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

		// Register core service bindings (Encryption, StorageManager,
		// repositories, services, controllers).
		ServiceProvider::register( $this->container );

		// REST API: register every controller's routes on rest_api_init.
		$this->boot_rest();

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
		$signature_repository = $this->container->make( SignatureRepository::class );

		// Three React-mounting pages, all backed by the same admin
		// bundle (assets/admin/src/main.tsx). The asset enqueuer
		// (registered inside AdminMenu) chooses the bootstrap `page`
		// key based on which hook suffix WordPress is currently
		// rendering, so the React app picks the right view.
		$signatures_page = new AdminAppPage( CapabilitiesInstaller::CAP_USE );
		$templates_page  = new AdminAppPage( CapabilitiesInstaller::CAP_USE );
		$settings_page   = new AdminAppPage( CapabilitiesInstaller::CAP_MANAGE_STORAGE );

		// Editor is its own iframe-host page (different React bundle).
		$editor_page = new EditorPage( $signature_repository );

		$admin_menu = new AdminMenu( $signatures_page, $templates_page, $settings_page, $editor_page );
		$admin_menu->boot();
	}

	/**
	 * Wires REST controllers via {@see RestRouter}.
	 *
	 * Pulls each controller from the container so a single instance is
	 * shared between the route-registration call and any other consumer
	 * that resolves it.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private function boot_rest(): void {
		$router = new RestRouter(
			[
				$this->container->make( MeController::class ),
				$this->container->make( SignaturesController::class ),
				$this->container->make( TemplatesController::class ),
				$this->container->make( StorageController::class ),
				$this->container->make( UploadController::class ),
				$this->container->make( AssetsController::class ),
				$this->container->make( SiteSettingsController::class ),
			]
		);
		$router->register();
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
