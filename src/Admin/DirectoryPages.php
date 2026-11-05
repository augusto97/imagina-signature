<?php
/**
 * Admin pages for profiles and groups.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Adds two submenu pages under the plugin menu, both mounting the admin
 * React app ({@see AdminAppPage}):
 *
 *  - "My profile" (`imagina-signatures-profile`, `imgsig_use_signatures`)
 *    → app page `profile`;
 *  - "Groups" (`imagina-signatures-groups`, `imgsig_manage_team`)
 *    → app page `groups` (groups + CSV profile import).
 *
 * Registered separately from {@see AdminMenu} (after it, on the same
 * `admin_menu` hook) with its own {@see AdminAssetEnqueuer} instance.
 *
 * @since 1.3.0
 */
final class DirectoryPages {

	public const PROFILE_SLUG = 'imagina-signatures-profile';
	public const GROUPS_SLUG  = 'imagina-signatures-groups';

	/**
	 * Hooks the menu registration.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'admin_menu', [ $this, 'register_menus' ], 11 );
	}

	/**
	 * Adds the submenu pages and wires the admin bundle on them.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function register_menus(): void {
		$profile_hook = add_submenu_page(
			AdminMenu::MENU_SLUG,
			__( 'My profile', 'imagina-signatures' ),
			__( 'My profile', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_USE,
			self::PROFILE_SLUG,
			[ new AdminAppPage( CapabilitiesInstaller::CAP_USE ), 'render' ]
		);

		$groups_hook = add_submenu_page(
			AdminMenu::MENU_SLUG,
			__( 'Groups', 'imagina-signatures' ),
			__( 'Groups', 'imagina-signatures' ),
			CapabilitiesInstaller::CAP_MANAGE_TEAM,
			self::GROUPS_SLUG,
			[ new AdminAppPage( CapabilitiesInstaller::CAP_MANAGE_TEAM ), 'render' ]
		);

		$hook_pages = [];
		if ( is_string( $profile_hook ) && '' !== $profile_hook ) {
			$hook_pages[ $profile_hook ] = 'profile';
		}
		if ( is_string( $groups_hook ) && '' !== $groups_hook ) {
			$hook_pages[ $groups_hook ] = 'groups';
		}

		if ( ! empty( $hook_pages ) ) {
			( new AdminAssetEnqueuer( $hook_pages ) )->boot();
		}
	}

	/**
	 * URL of the wp-admin "My profile" page.
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public static function profile_url(): string {
		return esc_url_raw( admin_url( 'admin.php?page=' . self::PROFILE_SLUG ) );
	}

	/**
	 * URL of the wp-admin "Groups" page.
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public static function groups_url(): string {
		return esc_url_raw( admin_url( 'admin.php?page=' . self::GROUPS_SLUG ) );
	}
}
