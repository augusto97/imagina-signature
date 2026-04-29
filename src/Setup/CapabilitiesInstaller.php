<?php
/**
 * Capability installer.
 *
 * @package ImaginaSignatures\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup;

defined( 'ABSPATH' ) || exit;

/**
 * Installs and removes the plugin's capabilities on native WordPress roles.
 *
 * Per CLAUDE.md §15 the plugin does NOT register custom roles or anything
 * resembling a plans/licensing system. It just adds three caps to the
 * roles WordPress ships with:
 *
 *  - `imgsig_use_signatures`  → admin, editor, author. CRUD on their own
 *                                signatures.
 *  - `imgsig_manage_templates`→ admin only. Manages global templates.
 *  - `imgsig_manage_storage`  → admin only. Configures storage settings.
 *
 * Both `install()` and `uninstall()` are idempotent: WordPress's role API
 * silently no-ops when adding a cap that already exists or removing a cap
 * the role never had.
 *
 * @since 1.0.0
 */
final class CapabilitiesInstaller {

	/**
	 * Capability granted to anyone who can author content.
	 *
	 * Admins inherit it explicitly so the cap is always present even if a
	 * site removes the implicit "admin can do everything" filter.
	 */
	public const CAP_USE = 'imgsig_use_signatures';

	/**
	 * Admin-only cap for managing global templates.
	 */
	public const CAP_MANAGE_TEMPLATES = 'imgsig_manage_templates';

	/**
	 * Admin-only cap for configuring the storage backend.
	 */
	public const CAP_MANAGE_STORAGE = 'imgsig_manage_storage';

	/**
	 * Roles that receive `CAP_USE` on install.
	 *
	 * @var string[]
	 */
	private const USE_ROLES = [ 'administrator', 'editor', 'author' ];

	/**
	 * Admin-only capabilities granted to the `administrator` role only.
	 *
	 * @var string[]
	 */
	private const ADMIN_CAPS = [
		self::CAP_MANAGE_TEMPLATES,
		self::CAP_MANAGE_STORAGE,
	];

	/**
	 * All capabilities owned by this plugin.
	 *
	 * Used by {@see uninstall()} to know which caps to scrub from every
	 * role on uninstall.
	 *
	 * @var string[]
	 */
	private const ALL_CAPS = [
		self::CAP_USE,
		self::CAP_MANAGE_TEMPLATES,
		self::CAP_MANAGE_STORAGE,
	];

	/**
	 * Adds the plugin's capabilities to the appropriate native roles.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function install(): void {
		foreach ( self::USE_ROLES as $role_name ) {
			$role = get_role( $role_name );
			if ( null === $role ) {
				continue;
			}
			$role->add_cap( self::CAP_USE );
		}

		$admin = get_role( 'administrator' );
		if ( null !== $admin ) {
			foreach ( self::ADMIN_CAPS as $cap ) {
				$admin->add_cap( $cap );
			}
		}
	}

	/**
	 * Removes every plugin capability from every role.
	 *
	 * Iterates the full role registry so caps are scrubbed even from roles
	 * the plugin never explicitly granted (e.g. roles added by a custom
	 * `add_role()` call after install).
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function uninstall(): void {
		$roles = wp_roles();

		foreach ( array_keys( $roles->roles ) as $role_name ) {
			$role = get_role( $role_name );
			if ( null === $role ) {
				continue;
			}
			foreach ( self::ALL_CAPS as $cap ) {
				$role->remove_cap( $cap );
			}
		}
	}
}
