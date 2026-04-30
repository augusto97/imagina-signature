<?php
/**
 * Admin menu registrar.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Admin\Pages\EditorPage;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the plugin's wp-admin menu structure.
 *
 * Three top-level destinations all back onto the same React admin
 * app ({@see AdminAppPage}) — different wp-admin URLs just tell the
 * app which "page" to render (Signatures / Templates / Settings).
 *
 * The Editor remains a dedicated wp-admin page that mounts the
 * iframe (full-screen React editor) — separate bundle, separate
 * config global. Reached only via the New / Edit links from the
 * Signatures listing, so it isn't surfaced in the side menu.
 *
 * @since 1.0.0
 */
final class AdminMenu {

	public const MENU_SLUG      = 'imagina-signatures';
	public const TEMPLATES_SLUG = 'imagina-signatures-templates';
	public const SETTINGS_SLUG  = 'imagina-signatures-settings';
	public const EDITOR_SLUG    = 'imagina-signatures-editor';

	/**
	 * @var AdminAppPage
	 */
	private AdminAppPage $signatures_page;

	/**
	 * @var AdminAppPage
	 */
	private AdminAppPage $templates_page;

	/**
	 * @var AdminAppPage
	 */
	private AdminAppPage $settings_page;

	/**
	 * @var EditorPage
	 */
	private EditorPage $editor_page;

	/**
	 * @param AdminAppPage $signatures_page Renderer for the signatures listing.
	 * @param AdminAppPage $templates_page  Renderer for the templates page.
	 * @param AdminAppPage $settings_page   Renderer for the storage settings page.
	 * @param EditorPage   $editor_page     Renderer for the editor iframe host.
	 */
	public function __construct(
		AdminAppPage $signatures_page,
		AdminAppPage $templates_page,
		AdminAppPage $settings_page,
		EditorPage $editor_page
	) {
		$this->signatures_page = $signatures_page;
		$this->templates_page  = $templates_page;
		$this->settings_page   = $settings_page;
		$this->editor_page     = $editor_page;
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
			[ $this->signatures_page, 'render' ],
			'dashicons-email-alt',
			30
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( 'My Signatures', 'imagina-signatures' ),
			__( 'My Signatures', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_USE,
			self::MENU_SLUG,
			[ $this->signatures_page, 'render' ]
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( 'Templates', 'imagina-signatures' ),
			__( 'Templates', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_USE,
			self::TEMPLATES_SLUG,
			[ $this->templates_page, 'render' ]
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( 'Storage Settings', 'imagina-signatures' ),
			__( 'Settings', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_MANAGE_STORAGE,
			self::SETTINGS_SLUG,
			[ $this->settings_page, 'render' ]
		);

		// Editor: registered with empty parent so it's hidden from the
		// menu but reachable via admin.php?page=...
		add_submenu_page(
			'',
			__( 'Edit Signature', 'imagina-signatures' ),
			__( 'Edit Signature', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_USE,
			self::EDITOR_SLUG,
			[ $this->editor_page, 'render' ]
		);
	}
}
