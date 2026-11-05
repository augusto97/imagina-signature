<?php
/**
 * Personal-data export / erasure for profile fields.
 *
 * @package ImaginaSignatures\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Directory;

defined( 'ABSPATH' ) || exit;

/**
 * Registers a WordPress privacy exporter and eraser for the values the
 * plugin itself stores in `imgsig_profile` (fields mapped to another
 * meta key belong to whoever owns that key) and the user's groups.
 *
 * @since 1.3.0
 */
final class ProfilePrivacy {

	public const ID = 'imagina-signatures-profile';

	/**
	 * Hooks the exporter and eraser.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public static function boot(): void {
		add_filter( 'wp_privacy_personal_data_exporters', [ self::class, 'register_exporter' ] );
		add_filter( 'wp_privacy_personal_data_erasers', [ self::class, 'register_eraser' ] );
	}

	/**
	 * @param mixed $exporters Registered exporters.
	 *
	 * @return array<string, mixed>
	 */
	public static function register_exporter( $exporters ): array {
		$exporters             = is_array( $exporters ) ? $exporters : [];
		$exporters[ self::ID ] = [
			'exporter_friendly_name' => __( 'Imagina Signatures profile', 'imagina-signatures' ),
			'callback'               => [ self::class, 'export' ],
		];
		return $exporters;
	}

	/**
	 * @param mixed $erasers Registered erasers.
	 *
	 * @return array<string, mixed>
	 */
	public static function register_eraser( $erasers ): array {
		$erasers             = is_array( $erasers ) ? $erasers : [];
		$erasers[ self::ID ] = [
			'eraser_friendly_name' => __( 'Imagina Signatures profile', 'imagina-signatures' ),
			'callback'             => [ self::class, 'erase' ],
		];
		return $erasers;
	}

	/**
	 * Exports the plugin-stored profile values and group names.
	 *
	 * @since 1.3.0
	 *
	 * @param string $email_address Requester's email.
	 *
	 * @return array{data: array<int, array<string, mixed>>, done: bool}
	 */
	public static function export( $email_address ): array {
		$user = get_user_by( 'email', (string) $email_address );
		if ( ! $user ) {
			return [
				'data' => [],
				'done' => true,
			];
		}

		$user_id = (int) $user->ID;
		$stored  = ProfileFields::stored( $user_id );
		$labels  = [];
		foreach ( ProfileFields::definitions() as $field ) {
			$labels[ $field['key'] ] = $field['label'];
		}

		$items = [];
		foreach ( $stored as $key => $value ) {
			$items[] = [
				'name'  => $labels[ $key ] ?? $key,
				'value' => $value,
			];
		}

		$names = [];
		foreach ( Groups::for_user( $user_id ) as $group_id ) {
			$group = Groups::get( $group_id );
			if ( null !== $group ) {
				$names[] = (string) $group['name'];
			}
		}
		if ( ! empty( $names ) ) {
			$items[] = [
				'name'  => __( 'Signature groups', 'imagina-signatures' ),
				'value' => implode( ', ', $names ),
			];
		}

		$data = [];
		if ( ! empty( $items ) ) {
			$data[] = [
				'group_id'    => 'imgsig-profile',
				'group_label' => __( 'Email signature profile', 'imagina-signatures' ),
				'item_id'     => 'imgsig-profile-' . $user_id,
				'data'        => $items,
			];
		}

		return [
			'data' => $data,
			'done' => true,
		];
	}

	/**
	 * Deletes the plugin-stored profile values and group memberships.
	 *
	 * @since 1.3.0
	 *
	 * @param string $email_address Requester's email.
	 *
	 * @return array{items_removed: bool, items_retained: bool, messages: string[], done: bool}
	 */
	public static function erase( $email_address ): array {
		$user    = get_user_by( 'email', (string) $email_address );
		$removed = false;
		if ( $user ) {
			$user_id = (int) $user->ID;
			if ( ! empty( ProfileFields::stored( $user_id ) ) ) {
				delete_user_meta( $user_id, ProfileFields::META_KEY );
				$removed = true;
			}
			if ( ! empty( Groups::for_user( $user_id ) ) ) {
				Groups::forget_user( $user_id );
				$removed = true;
			}
		}

		return [
			'items_removed'  => $removed,
			'items_retained' => false,
			'messages'       => [],
			'done'           => true,
		];
	}
}
