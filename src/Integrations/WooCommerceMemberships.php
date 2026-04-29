<?php
/**
 * WooCommerce Memberships integration skeleton.
 *
 * @package ImaginaSignatures\Integrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Integrations;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Listens for membership grants/expirations.
 *
 * @since 1.0.0
 */
final class WooCommerceMemberships {

	public function register(): void {
		if ( ! function_exists( 'wc_memberships' ) ) {
			return;
		}
		add_action( 'wc_memberships_user_membership_status_changed', [ $this, 'on_status_change' ], 10, 3 );
	}

	/**
	 * Reacts to a membership status change.
	 *
	 * @param mixed  $user_membership UserMembership instance.
	 * @param string $old_status      Previous status.
	 * @param string $new_status      New status.
	 *
	 * @return void
	 */
	public function on_status_change( $user_membership, string $old_status, string $new_status ): void {
		do_action( 'imgsig/integrations/wc_memberships/changed', $user_membership, $old_status, $new_status );
	}
}
