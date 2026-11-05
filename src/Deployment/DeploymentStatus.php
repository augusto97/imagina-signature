<?php
/**
 * Per-user deployment status.
 *
 * @package ImaginaSignatures\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment;

defined( 'ABSPATH' ) || exit;

/**
 * Records, per user and per channel, where their primary signature has
 * been deployed and with which HTML. Channels:
 *
 *  - `gmail`   pushed through the Gmail API (Google Workspace).
 *  - `outlook` served to the Outlook add-in.
 *  - `install` install link / invitation flow (copy & paste).
 *
 * Each channel entry is a free-form array owned by that integration;
 * by convention it carries `at` (UTC 'Y-m-d H:i:s'), `hash` (the
 * `html_hash` deployed) and optionally `error`. The team console
 * compares `hash` with the primary signature's current `html_hash`
 * to show "up to date" vs "outdated".
 *
 * Stored in one user meta row so the team list can read it without
 * extra queries per channel.
 *
 * @since 1.3.0
 */
final class DeploymentStatus {

	public const META_KEY = 'imgsig_deploy_status';

	public const CHANNELS = [ 'gmail', 'outlook', 'install' ];

	/**
	 * All channel entries for a user.
	 *
	 * @param int $user_id User.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public static function get( int $user_id ): array {
		$raw = get_user_meta( $user_id, self::META_KEY, true );
		if ( ! is_array( $raw ) ) {
			return [];
		}
		$out = [];
		foreach ( self::CHANNELS as $channel ) {
			if ( isset( $raw[ $channel ] ) && is_array( $raw[ $channel ] ) ) {
				$out[ $channel ] = $raw[ $channel ];
			}
		}
		return $out;
	}

	/**
	 * Merges `$entry` into one channel's record (keys not given are kept).
	 *
	 * @param int                  $user_id User.
	 * @param string               $channel One of {@see CHANNELS}.
	 * @param array<string, mixed> $entry   Values to set.
	 *
	 * @return void
	 */
	public static function set( int $user_id, string $channel, array $entry ): void {
		if ( ! in_array( $channel, self::CHANNELS, true ) ) {
			return;
		}
		$all             = self::get( $user_id );
		$all[ $channel ] = array_merge( $all[ $channel ] ?? [], $entry );
		update_user_meta( $user_id, self::META_KEY, $all );

		/**
		 * Fires after a user's deployment status changes on one channel.
		 *
		 * @since 1.3.0
		 *
		 * @param int                  $user_id User.
		 * @param string               $channel Channel.
		 * @param array<string, mixed> $record  The channel's full record.
		 */
		do_action( 'imgsig/deploy/status_changed', $user_id, $channel, $all[ $channel ] );
	}

	/**
	 * Removes one channel's record.
	 *
	 * @param int    $user_id User.
	 * @param string $channel Channel.
	 *
	 * @return void
	 */
	public static function clear( int $user_id, string $channel ): void {
		$all = self::get( $user_id );
		if ( isset( $all[ $channel ] ) ) {
			unset( $all[ $channel ] );
			update_user_meta( $user_id, self::META_KEY, $all );
		}
	}
}
