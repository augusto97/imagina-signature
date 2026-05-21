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
	 * Synchronises `CAP_USE` to match the given role list. Adds the
	 * cap to roles in `$desired_roles` that don't already have it,
	 * removes it from roles previously granted (via this method or
	 * {@see install()}) that aren't in the new list.
	 *
	 * The "previously granted" set is computed by scanning the role
	 * registry for any role that currently holds {@see CAP_USE} —
	 * which catches both the default install grants (administrator,
	 * editor, author) and any prior call to this method (e.g. a
	 * subscriber that was opted in then opted out).
	 *
	 * The administrator role is ALWAYS kept in the granted set. The
	 * "site admin" needs to be able to manage their own signatures
	 * regardless of which front-end role list the admin saved, and
	 * locking themselves out of the cap would be a silent footgun.
	 *
	 * @since 1.0.24
	 *
	 * @param array<int, string> $desired_roles Role slugs that should have CAP_USE.
	 *
	 * @return void
	 */
	public function sync_use_roles( array $desired_roles ): void {
		$roles = wp_roles();

		// Always preserve admin + the install-time defaults so the
		// frontend-access settings can't accidentally remove a cap
		// from a role that NEEDS it for the wp-admin UX to keep
		// working. Subscribers / customers / etc. are opt-in via
		// $desired_roles.
		$preserved = array_merge( self::USE_ROLES, $desired_roles );
		$preserved = array_values( array_unique( array_filter( array_map( 'sanitize_key', $preserved ) ) ) );

		foreach ( array_keys( $roles->roles ) as $role_name ) {
			$role = get_role( $role_name );
			if ( null === $role ) {
				continue;
			}
			$should_have = in_array( $role_name, $preserved, true );
			$has_cap     = ! empty( $role->capabilities[ self::CAP_USE ] );

			if ( $should_have && ! $has_cap ) {
				$role->add_cap( self::CAP_USE );
			} elseif ( ! $should_have && $has_cap ) {
				$role->remove_cap( self::CAP_USE );
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
