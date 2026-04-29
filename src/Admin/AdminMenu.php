<?php
/**
 * Admin menu registrar.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Admin\Pages\SettingsPage;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the plugin's wp-admin menu structure.
 *
 * Sprint 2 wires only the top-level entry and the Settings sub-page
 * (storage configuration). The Dashboard / Editor / Templates pages
 * land in later sprints; their menu slots are stubbed with a
 * placeholder body so the menu structure stays stable.
 *
 * Capabilities (CLAUDE.md §15.2):
 *  - Top entry & Dashboard sub-page: `imgsig_use_signatures`
 *  - Settings sub-page:              `imgsig_manage_storage`
 *
 * @since 1.0.0
 */
final class AdminMenu {

	/**
	 * Top-level menu slug.
	 */
	public const MENU_SLUG = 'imagina-signatures';

	/**
	 * Settings sub-page slug.
	 */
	public const SETTINGS_SLUG = 'imagina-signatures-settings';

	/**
	 * @var SettingsPage
	 */
	private SettingsPage $settings_page;

	/**
	 * @param SettingsPage $settings_page Renderer for the storage settings page.
	 */
	public function __construct( SettingsPage $settings_page ) {
		$this->settings_page = $settings_page;
	}

	/**
	 * Hooks the menu registration into WordPress.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'admin_menu', [ $this, 'register_menus' ] );
		$this->settings_page->register_handlers();
	}

	/**
	 * Adds the top-level menu and submenus.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function register_menus(): void {
		add_menu_page(
			__( 'Imagina Signatures', 'imagina-signatures' ),
			__( 'Imagina Signatures', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_USE,
			self::MENU_SLUG,
			[ $this, 'render_dashboard_placeholder' ],
			'dashicons-email-alt',
			30
		);

		// Settings — storage configuration.
		add_submenu_page(
			self::MENU_SLUG,
			__( 'Storage Settings', 'imagina-signatures' ),
			__( 'Settings', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_MANAGE_STORAGE,
			self::SETTINGS_SLUG,
			[ $this->settings_page, 'render' ]
		);
	}

	/**
	 * Placeholder dashboard body until {@see DashboardPage} lands.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function render_dashboard_placeholder(): void {
		if ( ! current_user_can( CapabilitiesInstaller::CAP_USE ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'imagina-signatures' ) );
		}

		echo '<div class="wrap">';
		echo '<h1>' . esc_html__( 'Imagina Signatures', 'imagina-signatures' ) . '</h1>';
		echo '<p>' . esc_html__( 'The signature dashboard is coming soon.', 'imagina-signatures' ) . '</p>';
		echo '</div>';
	}
}
