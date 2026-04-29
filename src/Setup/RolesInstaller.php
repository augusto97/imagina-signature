<?php
/**
 * Roles & capabilities installer.
 *
 * @package ImaginaSignatures\Setup
 */

declare(strict_types=1);

namespace ImaginaSignatures\Setup;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers the plugin's custom role and capabilities.
 *
 * The `imgsig_user` role groups every capability a non-admin signature owner
 * needs. Site administrators receive the management capabilities so they can
 * configure plans, storage, templates, and view all signatures.
 *
 * @since 1.0.0
 */
final class RolesInstaller {

	private const ROLE_USER = 'imgsig_user';

	/**
	 * Capabilities granted to the custom user role.
	 *
	 * @var string[]
	 */
	private const USER_CAPS = [
		'imgsig_read_own_signatures',
		'imgsig_create_signatures',
		'imgsig_edit_own_signatures',
		'imgsig_delete_own_signatures',
		'imgsig_upload_assets',
		'imgsig_export_signatures',
	];

	/**
	 * Capabilities added to the administrator role.
	 *
	 * @var string[]
	 */
	private const ADMIN_CAPS = [
		'imgsig_admin',
		'imgsig_manage_plans',
		'imgsig_manage_users',
		'imgsig_manage_storage',
		'imgsig_manage_templates',
		'imgsig_view_all_signatures',
	];

	/**
	 * Creates the role and grants admin capabilities.
	 *
	 * Idempotent: re-running on an already-installed site is a no-op.
	 *
	 * @since 1.0.0
	 */
	public function install(): void {
		$role_caps = [ 'read' => true ];
		foreach ( self::USER_CAPS as $cap ) {
			$role_caps[ $cap ] = true;
		}

		if ( null === get_role( self::ROLE_USER ) ) {
			add_role(
				self::ROLE_USER,
				__( 'Imagina Signatures User', 'imagina-signatures' ),
				$role_caps
			);
		} else {
			$role = get_role( self::ROLE_USER );
			foreach ( $role_caps as $cap => $granted ) {
				if ( $granted ) {
					$role->add_cap( $cap );
				}
			}
		}

		$admin = get_role( 'administrator' );
		if ( $admin instanceof \WP_Role ) {
			foreach ( self::ADMIN_CAPS as $cap ) {
				$admin->add_cap( $cap );
			}
			// Admin should also see the user-scoped caps so they can manage
			// signatures on behalf of any user.
			foreach ( self::USER_CAPS as $cap ) {
				$admin->add_cap( $cap );
			}
		}
	}

	/**
	 * Removes the role and admin capabilities.
	 *
	 * @since 1.0.0
	 */
	public function uninstall(): void {
		remove_role( self::ROLE_USER );

		$admin = get_role( 'administrator' );
		if ( $admin instanceof \WP_Role ) {
			foreach ( self::ADMIN_CAPS as $cap ) {
				$admin->remove_cap( $cap );
			}
			foreach ( self::USER_CAPS as $cap ) {
				$admin->remove_cap( $cap );
			}
		}
	}

	/**
	 * Returns the role slug.
	 *
	 * @since 1.0.0
	 *
	 * @return string
	 */
	public static function role_slug(): string {
		return self::ROLE_USER;
	}

	/**
	 * Returns the user-scoped capability list.
	 *
	 * @since 1.0.0
	 *
	 * @return string[]
	 */
	public static function user_capabilities(): array {
		return self::USER_CAPS;
	}

	/**
	 * Returns the admin-scoped capability list.
	 *
	 * @since 1.0.0
	 *
	 * @return string[]
	 */
	public static function admin_capabilities(): array {
		return self::ADMIN_CAPS;
	}
}
