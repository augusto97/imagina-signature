<?php
/**
 * Registers wp-admin menu entries for the plugin.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Builds the plugin's admin menu tree.
 *
 * Menu items are conditional on capabilities and on the active mode
 * (`single` vs `multi`). The setup wizard intercepts navigation until
 * `imgsig_setup_completed` is true.
 *
 * @since 1.0.0
 */
final class AdminMenu {

	private const PARENT_SLUG = 'imagina-signatures';

	/**
	 * Hooks the menu registration into WordPress.
	 *
	 * @return void
	 */
	public function register(): void {
		add_action( 'admin_menu', [ $this, 'add_menu' ] );
	}

	/**
	 * Adds the menu entries.
	 *
	 * @return void
	 */
	public function add_menu(): void {
		if ( ! current_user_can( 'imgsig_read_own_signatures' ) && ! current_user_can( 'imgsig_admin' ) ) {
			return;
		}

		add_menu_page(
			__( 'Imagina Signatures', 'imagina-signatures' ),
			__( 'Signatures', 'imagina-signatures' ),
			'imgsig_read_own_signatures',
			self::PARENT_SLUG,
			[ $this, 'render_dashboard' ],
			'dashicons-email-alt',
			65
		);

		add_submenu_page(
			self::PARENT_SLUG,
			__( 'My Signatures', 'imagina-signatures' ),
			__( 'My Signatures', 'imagina-signatures' ),
			'imgsig_read_own_signatures',
			self::PARENT_SLUG,
			[ $this, 'render_dashboard' ]
		);

		add_submenu_page(
			self::PARENT_SLUG,
			__( 'Editor', 'imagina-signatures' ),
			__( 'Editor', 'imagina-signatures' ),
			'imgsig_create_signatures',
			'imagina-signatures-editor',
			[ $this, 'render_editor' ]
		);

		add_submenu_page(
			self::PARENT_SLUG,
			__( 'Templates', 'imagina-signatures' ),
			__( 'Templates', 'imagina-signatures' ),
			'imgsig_read_own_signatures',
			'imagina-signatures-templates',
			[ $this, 'render_templates' ]
		);

		if ( current_user_can( 'imgsig_admin' ) ) {
			add_submenu_page(
				self::PARENT_SLUG,
				__( 'Plans', 'imagina-signatures' ),
				__( 'Plans', 'imagina-signatures' ),
				'imgsig_manage_plans',
				'imagina-signatures-plans',
				[ $this, 'render_plans' ]
			);

			add_submenu_page(
				self::PARENT_SLUG,
				__( 'Users', 'imagina-signatures' ),
				__( 'Users', 'imagina-signatures' ),
				'imgsig_manage_users',
				'imagina-signatures-users',
				[ $this, 'render_users' ]
			);

			add_submenu_page(
				self::PARENT_SLUG,
				__( 'Storage', 'imagina-signatures' ),
				__( 'Storage', 'imagina-signatures' ),
				'imgsig_manage_storage',
				'imagina-signatures-storage',
				[ $this, 'render_storage' ]
			);

			add_submenu_page(
				self::PARENT_SLUG,
				__( 'Settings', 'imagina-signatures' ),
				__( 'Settings', 'imagina-signatures' ),
				'imgsig_admin',
				'imagina-signatures-settings',
				[ $this, 'render_settings' ]
			);
		}

		// Setup wizard is registered as a hidden page.
		add_submenu_page(
			'',
			__( 'Setup Imagina Signatures', 'imagina-signatures' ),
			__( 'Setup', 'imagina-signatures' ),
			'imgsig_admin',
			'imagina-signatures-setup',
			[ $this, 'render_setup' ]
		);
	}

	public function render_dashboard(): void {
		$this->render_app_root( 'dashboard' );
	}
	public function render_editor(): void {
		$this->render_app_root( 'editor' );
	}
	public function render_templates(): void {
		$this->render_app_root( 'templates' );
	}
	public function render_plans(): void {
		$this->render_app_root( 'plans' );
	}
	public function render_users(): void {
		$this->render_app_root( 'users' );
	}
	public function render_storage(): void {
		$this->render_app_root( 'storage' );
	}
	public function render_settings(): void {
		$this->render_app_root( 'settings' );
	}
	public function render_setup(): void {
		$this->render_app_root( 'setup' );
	}

	/**
	 * Renders the SPA mount point.
	 *
	 * The actual UI is bundled by Vite and enqueued in `AssetEnqueuer`.
	 *
	 * @param string $route Logical route name.
	 *
	 * @return void
	 */
	private function render_app_root( string $route ): void {
		echo '<div class="imagina-signatures-app" data-route="' . esc_attr( $route ) . '"></div>';
	}
}
