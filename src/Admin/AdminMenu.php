<?php
/**
 * Admin menu registrar.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Admin\Pages\DashboardPage;
use ImaginaSignatures\Admin\Pages\EditorPage;
use ImaginaSignatures\Admin\Pages\SettingsPage;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the plugin's wp-admin menu structure.
 *
 * Wires:
 *  - Top-level "Imagina Signatures" — drops the user on Dashboard.
 *  - Dashboard      submenu (cap `imgsig_use_signatures`).
 *  - Editor         submenu (cap `imgsig_use_signatures`); hidden
 *                   from the menu but registered so admin.php?page=
 *                   loads it. The "New" button on Dashboard and
 *                   "Edit" links on each row point here.
 *  - Settings       submenu (cap `imgsig_manage_storage`).
 *
 * Templates page lands in Sprint 10 alongside the templates seeder.
 *
 * @since 1.0.0
 */
final class AdminMenu {

	public const MENU_SLUG     = 'imagina-signatures';
	public const EDITOR_SLUG   = 'imagina-signatures-editor';
	public const SETTINGS_SLUG = 'imagina-signatures-settings';

	/**
	 * @var DashboardPage
	 */
	private DashboardPage $dashboard_page;

	/**
	 * @var EditorPage
	 */
	private EditorPage $editor_page;

	/**
	 * @var SettingsPage
	 */
	private SettingsPage $settings_page;

	/**
	 * @param DashboardPage $dashboard_page Dashboard renderer.
	 * @param EditorPage    $editor_page    Editor (iframe host) renderer.
	 * @param SettingsPage  $settings_page  Settings renderer.
	 */
	public function __construct(
		DashboardPage $dashboard_page,
		EditorPage $editor_page,
		SettingsPage $settings_page
	) {
		$this->dashboard_page = $dashboard_page;
		$this->editor_page    = $editor_page;
		$this->settings_page  = $settings_page;
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
			[ $this->dashboard_page, 'render' ],
			'dashicons-email-alt',
			30
		);

		// Dashboard explicit (renames the auto-created first submenu).
		add_submenu_page(
			self::MENU_SLUG,
			__( 'My Signatures', 'imagina-signatures' ),
			__( 'My Signatures', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_USE,
			self::MENU_SLUG,
			[ $this->dashboard_page, 'render' ]
		);

		// Editor — registered with `null` parent so it's hidden from
		// the menu (you reach it from the dashboard's New / Edit
		// links), but the page still mounts at admin.php?page=...
		add_submenu_page(
			'',
			__( 'Edit Signature', 'imagina-signatures' ),
			__( 'Edit Signature', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_USE,
			self::EDITOR_SLUG,
			[ $this->editor_page, 'render' ]
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( 'Storage Settings', 'imagina-signatures' ),
			__( 'Settings', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_MANAGE_STORAGE,
			self::SETTINGS_SLUG,
			[ $this->settings_page, 'render' ]
		);
	}
}
