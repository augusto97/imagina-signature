<?php
/**
 * Dashboard admin page (signatures listing).
 *
 * @package ImaginaSignatures\Admin\Pages
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin\Pages;

use ImaginaSignatures\Admin\AdminMenu;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Lists the signatures owned by the current user.
 *
 * Server-rendered Sprint 4 implementation — a richer React app may
 * replace this in a later sprint, but this version gives the user a
 * working CRUD entry point: list, "New", "Edit", "Delete".
 *
 * @since 1.0.0
 */
final class DashboardPage {

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $repo;

	/**
	 * @param SignatureRepository $repo Signature repository.
	 */
	public function __construct( SignatureRepository $repo ) {
		$this->repo = $repo;
	}

	/**
	 * Renders the dashboard body.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function render(): void {
		if ( ! current_user_can( CapabilitiesInstaller::CAP_USE ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'imagina-signatures' ) );
		}

		$user_id    = get_current_user_id();
		$signatures = $this->repo->find_by_user( $user_id, [ 'per_page' => 50 ] );

		$editor_url = add_query_arg(
			[ 'page' => AdminMenu::EDITOR_SLUG ],
			admin_url( 'admin.php' )
		);

		echo '<div class="wrap">';
		echo '<h1 class="wp-heading-inline">' . esc_html__( 'My Signatures', 'imagina-signatures' ) . '</h1>';
		echo ' <a href="' . esc_url( $editor_url ) . '" class="page-title-action">'
			. esc_html__( 'Add New', 'imagina-signatures' ) . '</a>';
		echo '<hr class="wp-header-end">';

		if ( empty( $signatures ) ) {
			echo '<p>' . esc_html__( 'You haven\'t created any signatures yet.', 'imagina-signatures' ) . '</p>';
			echo '</div>';
			return;
		}

		echo '<table class="wp-list-table widefat fixed striped">';
		echo '<thead><tr>';
		echo '<th>' . esc_html__( 'Name', 'imagina-signatures' ) . '</th>';
		echo '<th>' . esc_html__( 'Status', 'imagina-signatures' ) . '</th>';
		echo '<th>' . esc_html__( 'Updated', 'imagina-signatures' ) . '</th>';
		echo '<th>' . esc_html__( 'Actions', 'imagina-signatures' ) . '</th>';
		echo '</tr></thead><tbody>';

		foreach ( $signatures as $signature ) {
			$edit_url = add_query_arg(
				[
					'page' => AdminMenu::EDITOR_SLUG,
					'id'   => $signature->id,
				],
				admin_url( 'admin.php' )
			);

			echo '<tr>';
			echo '<td><a href="' . esc_url( $edit_url ) . '">' . esc_html( $signature->name ) . '</a></td>';
			echo '<td>' . esc_html( ucfirst( $signature->status ) ) . '</td>';
			echo '<td>' . esc_html( $signature->updated_at ) . '</td>';
			echo '<td><a href="' . esc_url( $edit_url ) . '" class="button">'
				. esc_html__( 'Edit', 'imagina-signatures' ) . '</a></td>';
			echo '</tr>';
		}

		echo '</tbody></table>';
		echo '</div>';
	}
}
