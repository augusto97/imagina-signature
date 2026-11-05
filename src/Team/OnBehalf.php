<?php
/**
 * Who may edit someone else's signature.
 *
 * @package ImaginaSignatures\Team
 */

declare(strict_types=1);

namespace ImaginaSignatures\Team;

use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * "Edit on behalf" (1.3.0): a user with `imgsig_manage_team` (and
 * `imgsig_use_signatures`, to open the editor at all) may read and save
 * another user's signature from the team console. Deleting, duplicating
 * or changing someone's primary signature stays with the owner.
 *
 * The stored HTML of such a save is compiled with the OWNER's system
 * variables, footer and campaigns (the editor bootstrap uses
 * {@see \ImaginaSignatures\Services\RenderInputs} for the owner), linked
 * signature restrictions don't apply to the editor (they can bypass
 * locks), and every save fires `imgsig/signature/edited_on_behalf`.
 *
 * @since 1.3.0
 */
final class OnBehalf {

	/**
	 * Whether the current user may edit `$owner_id`'s signatures on their
	 * behalf. False for their own signatures (that's not "on behalf").
	 *
	 * @since 1.3.0
	 *
	 * @param int $owner_id Signature owner.
	 *
	 * @return bool
	 */
	public static function current_user_can_edit( int $owner_id ): bool {
		$editor_id = get_current_user_id();
		if ( $owner_id <= 0 || $editor_id <= 0 || $owner_id === $editor_id ) {
			return false;
		}
		if ( ! current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEAM ) || ! current_user_can( CapabilitiesInstaller::CAP_USE ) ) {
			return false;
		}
		return false !== get_userdata( $owner_id );
	}

	/**
	 * Fires `imgsig/signature/edited_on_behalf`.
	 *
	 * @since 1.3.0
	 *
	 * @param Signature $signature The saved signature (owner = `$signature->user_id`).
	 * @param int       $editor_id Team manager who saved it.
	 * @param string[]  $fields    Fields sent in the save (`json_content`, `name`, `html`…).
	 *
	 * @return void
	 */
	public static function announce( Signature $signature, int $editor_id, array $fields ): void {
		/**
		 * Fires after a team manager saved another user's signature on
		 * their behalf — log it, notify the owner, etc.
		 *
		 * @since 1.3.0
		 *
		 * @param Signature $signature The saved signature (owner = `$signature->user_id`).
		 * @param int       $editor_id User who saved it.
		 * @param string[]  $fields    Fields that were sent.
		 */
		do_action( 'imgsig/signature/edited_on_behalf', $signature, $editor_id, array_values( $fields ) );
	}
}
