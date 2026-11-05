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
use ImaginaSignatures\Admin\Notices;
use ImaginaSignatures\Admin\Pages\EditorPage;
use ImaginaSignatures\Frontend\FrontendRouter;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Api\Controllers\AssetsController;
use ImaginaSignatures\Api\Controllers\FrontendAccessController;
use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Api\Controllers\MeController;
use ImaginaSignatures\Api\Controllers\OutlookController;
use ImaginaSignatures\Api\Controllers\SignaturesController;
use ImaginaSignatures\Api\Controllers\StorageController;
use ImaginaSignatures\Api\Controllers\TemplatesController;
use ImaginaSignatures\Api\Controllers\UploadController;
use ImaginaSignatures\Api\RestRouter;
use ImaginaSignatures\Deployment\OutlookWellKnown;
use ImaginaSignatures\Hooks\Actions;
use ImaginaSignatures\Privacy\UserDataManager;
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

		// Translations: text domain on `init` (with the es_* → es_ES
		// fallback) and user-locale REST responses. See I18n.
		I18n::boot();

		// Register core service bindings (Encryption, StorageManager,
		// repositories, services, controllers).
		ServiceProvider::register( $this->container );

		// Upgrade hook (1.0.32, reworked 1.0.40). `register_activation_hook`
		// only fires when the user clicks Activate — NOT when they
		// overwrite the plugin via "Upload Plugin → Replace current", and
		// never on the subsites of a network activation. So we compare
		// the stored `imgsig_version` against `IMGSIG_VERSION` and re-run
		// the (idempotent) `Installer::install()` when it's behind.
		// Only on admin requests and authenticated REST requests (never
		// for anonymous front-end traffic), under a lock, with a one-hour
		// back-off after a failure — see maybe_upgrade().
		add_action( 'admin_init', [ $this, 'maybe_upgrade' ] );
		add_action( 'rest_api_init', [ $this, 'maybe_upgrade_for_rest' ], 1 );

		// REST API: register every controller's routes on rest_api_init.
		$this->boot_rest();

		// WP-Cron handlers (daily rate-limit purge).
		Cron::boot();

		// Personal-data exporter / eraser + delete_user cleanup.
		$this->container->make( UserDataManager::class )->register();

		// Public-facing route — runs on EVERY request, admin or not.
		// The router self-gates on its own settings; when the feature
		// is disabled (or the URL doesn't match its rewrite) it's a
		// no-op so the boot cost is one `add_action` call.
		( new FrontendRouter() )->boot();

		// Outlook add-in: /.well-known/microsoft-officeaddins-allowed.json
		// (self-gated: a string compare per request, no-op while disabled).
		( new OutlookWellKnown() )->boot();

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
	 * Option used as a mutex while an upgrade install runs.
	 */
	private const UPGRADE_LOCK_OPTION = 'imgsig_upgrade_lock';

	/**
	 * Transient set for an hour after a failed upgrade install.
	 */
	private const UPGRADE_BACKOFF_TRANSIENT = 'imgsig_upgrade_backoff';

	/**
	 * A lock older than this is considered abandoned (seconds).
	 */
	private const UPGRADE_LOCK_TTL = 600;

	/**
	 * `rest_api_init` wrapper: only authenticated REST requests may
	 * trigger the upgrade.
	 *
	 * @since 1.0.40
	 *
	 * @return void
	 */
	public function maybe_upgrade_for_rest(): void {
		if ( is_user_logged_in() ) {
			$this->maybe_upgrade();
		}
	}

	/**
	 * Runs `Installer::install()` when the stored `imgsig_version` is
	 * behind `IMGSIG_VERSION` — including a missing version ('0.0.0'),
	 * which is what every subsite of a network activation has, since
	 * the activation hook only ran on the main site.
	 *
	 * Guarded so it can't stampede or loop:
	 *  - a lock (`add_option`, atomic on the unique option_name) lets a
	 *    single request run the install; a lock older than 10 minutes is
	 *    treated as abandoned;
	 *  - after a failure the attempt is retried at most once an hour
	 *    (transient back-off) instead of on every request.
	 *
	 * @since 1.0.32
	 *
	 * @return void
	 */
	public function maybe_upgrade(): void {
		$current_version = defined( 'IMGSIG_VERSION' ) ? (string) IMGSIG_VERSION : '0.0.0';
		$stored_version  = (string) get_option( 'imgsig_version', '0.0.0' );

		if ( version_compare( $stored_version, $current_version, '>=' ) ) {
			return;
		}

		if ( false !== get_transient( self::UPGRADE_BACKOFF_TRANSIENT ) ) {
			return;
		}

		if ( ! add_option( self::UPGRADE_LOCK_OPTION, time(), '', 'no' ) ) {
			$locked_at = (int) get_option( self::UPGRADE_LOCK_OPTION, 0 );
			if ( $locked_at > time() - self::UPGRADE_LOCK_TTL ) {
				return; // Another request is upgrading right now.
			}
			update_option( self::UPGRADE_LOCK_OPTION, time(), false );
		}

		try {
			( new Installer() )->install();

			// New / renamed public routes need their rewrite rules
			// committed (subsites never ran the activation flush).
			FrontendRouter::register_rewrite_rules();
			flush_rewrite_rules( false );
		} catch ( \Throwable $e ) {
			set_transient( self::UPGRADE_BACKOFF_TRANSIENT, time(), HOUR_IN_SECONDS );
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log(
				'[imagina-signatures] upgrade install (' . $stored_version . ' → ' . $current_version . ') failed, retrying in 1 hour: ' . $e->getMessage()
			);
		} finally {
			delete_option( self::UPGRADE_LOCK_OPTION );
		}
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

		( new Notices() )->boot();
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
				$this->container->make( FrontendAccessController::class ),
				$this->container->make( OutlookController::class ),
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
