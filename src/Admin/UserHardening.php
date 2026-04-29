<?php
/**
 * Hardens the wp-admin experience for `imgsig_user`.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Restricts wp-admin to plugin-relevant pages for plain `imgsig_user`s.
 *
 * Only applies in multi-user mode. Site administrators are exempt.
 *
 * @since 1.0.0
 */
final class UserHardening {

	private const ROLE   = 'imgsig_user';
	private const TARGET = 'admin.php?page=imagina-signatures';

	/**
	 * Hooks the hardening logic.
	 *
	 * @return void
	 */
	public function register(): void {
		add_action(
			'init',
			function (): void {
				if ( ! $this->should_apply() ) {
					return;
				}
				add_filter( 'show_admin_bar', '__return_false' );
				add_action( 'admin_menu', [ $this, 'remove_default_menus' ], 999 );
				add_action( 'admin_init', [ $this, 'redirect_from_dashboard' ] );
				add_action( 'wp_before_admin_bar_render', [ $this, 'remove_admin_bar_items' ] );
			}
		);
	}

	/**
	 * Removes irrelevant top-level menu pages.
	 *
	 * @return void
	 */
	public function remove_default_menus(): void {
		$slugs = [
			'edit.php',
			'edit.php?post_type=page',
			'edit-comments.php',
			'tools.php',
			'themes.php',
			'plugins.php',
			'options-general.php',
			'upload.php',
		];
		foreach ( $slugs as $slug ) {
			remove_menu_page( $slug );
		}
	}

	/**
	 * Bounces the user away from the WordPress dashboard.
	 *
	 * @return void
	 */
	public function redirect_from_dashboard(): void {
		if ( wp_doing_ajax() ) {
			return;
		}
		global $pagenow;
		if ( 'index.php' === $pagenow ) {
			wp_safe_redirect( admin_url( self::TARGET ) );
			exit;
		}
	}

	/**
	 * Strips noisy items from the admin bar.
	 *
	 * @return void
	 */
	public function remove_admin_bar_items(): void {
		global $wp_admin_bar;
		if ( ! ( $wp_admin_bar instanceof \WP_Admin_Bar ) ) {
			return;
		}
		foreach ( [ 'wp-logo', 'comments', 'new-content', 'updates' ] as $node ) {
			$wp_admin_bar->remove_node( $node );
		}
	}

	/**
	 * Returns true when hardening should apply to the current user.
	 *
	 * @return bool
	 */
	private function should_apply(): bool {
		if ( 'multi' !== (string) get_option( 'imgsig_mode', 'single' ) ) {
			return false;
		}
		if ( ! is_user_logged_in() ) {
			return false;
		}
		$user = wp_get_current_user();
		if ( ! ( $user instanceof \WP_User ) ) {
			return false;
		}
		return in_array( self::ROLE, (array) $user->roles, true )
			&& ! in_array( 'administrator', (array) $user->roles, true );
	}
}
