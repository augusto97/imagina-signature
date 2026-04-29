<?php
/**
 * MemberPress integration skeleton.
 *
 * @package ImaginaSignatures\Integrations
 */

declare(strict_types=1);

namespace ImaginaSignatures\Integrations;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class MemberPress {

	public function register(): void {
		if ( ! defined( 'MEPR_VERSION' ) ) {
			return;
		}
		add_action( 'mepr-event-transaction-completed', [ $this, 'on_transaction' ] );
	}

	/**
	 * @param mixed $event MemberPress event payload.
	 *
	 * @return void
	 */
	public function on_transaction( $event ): void {
		do_action( 'imgsig/integrations/memberpress/transaction', $event );
	}
}
