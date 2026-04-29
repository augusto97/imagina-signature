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

		// Each phase is wrapped in a try/catch so a single failure (a missing
		// file, a corrupted option, a third-party plugin throwing in our
		// hooks) doesn't cascade into a full white-screen. Errors surface
		// via the PHP error log and as an admin notice.
		$this->safe( fn() => $this->load_textdomain(), 'textdomain' );
		$this->safe( fn() => $this->run_pending_migrations(), 'migrations' );
		$this->safe( fn() => $this->register_services(), 'services' );
		$this->safe( fn() => $this->maybe_run_upgrade(), 'upgrade' );

		if ( is_admin() ) {
			$this->safe( fn() => $this->container->make( \ImaginaSignatures\Admin\AdminMenu::class )->register(), 'admin/menu' );
			$this->safe( fn() => $this->container->make( \ImaginaSignatures\Admin\AssetEnqueuer::class )->register(), 'admin/assets' );
			$this->safe( fn() => $this->container->make( \ImaginaSignatures\Admin\Notices::class )->register(), 'admin/notices' );
			$this->safe( fn() => $this->container->make( \ImaginaSignatures\Admin\UserHardening::class )->register(), 'admin/hardening' );
			$this->safe( fn() => $this->container->make( \ImaginaSignatures\Admin\SetupFallback::class )->register(), 'admin/setup_fallback' );
			add_action( 'admin_init', [ $this, 'maybe_redirect_to_setup' ] );
		}

		// Always register the REST hook outside the admin block so
		// /wp-json/ requests (which run with is_admin() = false) get
		// their routes.
		add_action(
			'rest_api_init',
			function (): void {
				$this->safe(
					fn() => $this->container->make( \ImaginaSignatures\Api\RestRouter::class )->register_routes(),
					'rest/routes'
				);
			}
		);

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
	 * Boot-time errors observed during this request, indexed by phase.
	 *
	 * @var array<string, string>
	 */
	private array $boot_errors = [];

	/**
	 * Runs a callable, logs any throwable, and stashes the message for
	 * later surfacing.
	 *
	 * @param callable $cb    Callable to run.
	 * @param string   $phase Logical phase name (used in logs).
	 *
	 * @return void
	 */
	private function safe( callable $cb, string $phase ): void {
		try {
			$cb();
		} catch ( \Throwable $e ) {
			$this->boot_errors[ $phase ] = sprintf(
				'%s: %s (%s:%d)',
				get_class( $e ),
				$e->getMessage(),
				$e->getFile(),
				$e->getLine()
			);
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( '[imagina-signatures] ' . $phase . ' failed: ' . $this->boot_errors[ $phase ] );
		}
	}

	/**
	 * Returns boot-phase errors recorded during this request.
	 *
	 * @return array<string, string>
	 */
	public function boot_errors(): array {
		return $this->boot_errors;
	}

	/**
	 * Re-asserts the role install + plans seed when the version on disk
	 * changes. Idempotent — repeated calls with the same version are no-ops.
	 *
	 * @return void
	 */
	private function maybe_run_upgrade(): void {
		$stored = (string) get_option( 'imgsig_version', '0.0.0' );
		if ( '0.0.0' === $stored || version_compare( $stored, IMGSIG_VERSION, '<' ) ) {
			( new \ImaginaSignatures\Setup\RolesInstaller() )->install();
			( new \ImaginaSignatures\Setup\DefaultPlansSeeder() )->seed();
			update_option( 'imgsig_version', IMGSIG_VERSION, false );
		}
	}

	/**
	 * Registers services in the DI container.
	 *
	 * @since 1.0.0
	 */
	private function register_services(): void {
		( new ServiceProvider() )->register( $this->container );
	}

	/**
	 * Redirects the admin to the setup wizard once after activation.
	 *
	 * Triggered by the transient set in `Activator::activate()`. The transient
	 * is consumed regardless of whether the redirect actually happens, so we
	 * never attempt to redirect on every page load.
	 *
	 * @since 1.0.0
	 */
	public function maybe_redirect_to_setup(): void {
		if ( ! get_transient( 'imgsig_redirect_to_setup' ) ) {
			return;
		}
		delete_transient( 'imgsig_redirect_to_setup' );

		if ( wp_doing_ajax() || ! current_user_can( 'imgsig_admin' ) ) {
			return;
		}
		// Don't bounce the user if they're already on a plugin screen.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( (string) $_GET['page'] ) ) : '';
		if ( '' !== $page && false !== strpos( $page, 'imagina-signatures' ) ) {
			return;
		}

		wp_safe_redirect( admin_url( 'admin.php?page=imagina-signatures-setup' ) );
		exit;
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
