<?php
/**
 * "Email signature profile" section on the WordPress profile screen.
 *
 * @package ImaginaSignatures\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Directory;

use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Adds the profile fields ({@see ProfileFields}) to `profile.php` /
 * `user-edit.php`, and the group checkboxes for team managers.
 *
 * Who may edit:
 *  - their own profile: anyone with `imgsig_use_signatures`;
 *  - someone else's: `edit_user` on that user AND (`edit_users` or
 *    `imgsig_manage_team`).
 * Group membership can only be changed with `imgsig_manage_team`.
 *
 * Saving needs this section's own nonce on top of the core form nonce.
 *
 * @since 1.3.0
 */
final class ProfileScreen {

	private const NONCE_FIELD  = 'imgsig_profile_nonce';
	private const NONCE_ACTION = 'imgsig_profile_update_';
	private const FORM_KEY     = 'imgsig_profile';
	private const GROUPS_KEY   = 'imgsig_groups';
	private const GROUPS_FLAG  = 'imgsig_groups_present';

	/**
	 * Hooks the render and save callbacks.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public static function boot(): void {
		add_action( 'show_user_profile', [ self::class, 'render' ] );
		add_action( 'edit_user_profile', [ self::class, 'render' ] );
		add_action( 'personal_options_update', [ self::class, 'save' ] );
		add_action( 'edit_user_profile_update', [ self::class, 'save' ] );
	}

	/**
	 * Whether the current user may edit `$user_id`'s profile fields.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id Profile owner.
	 *
	 * @return bool
	 */
	public static function can_edit( int $user_id ): bool {
		$current = get_current_user_id();
		if ( $current <= 0 || $user_id <= 0 ) {
			return false;
		}
		if ( $current === $user_id ) {
			return current_user_can( CapabilitiesInstaller::CAP_USE );
		}
		return current_user_can( 'edit_user', $user_id )
			&& ( current_user_can( 'edit_users' ) || current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEAM ) );
	}

	/**
	 * Renders the section.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_User|mixed $user Profile owner.
	 *
	 * @return void
	 */
	public static function render( $user ): void {
		if ( ! is_object( $user ) || ! isset( $user->ID ) || ! self::can_edit( (int) $user->ID ) ) {
			return;
		}
		$user_id = (int) $user->ID;
		$values  = ProfileFields::values_for( $user_id );
		$manage  = current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEAM );
		$groups  = Groups::all();
		$member  = Groups::for_user( $user_id );

		?>
		<h2 id="imgsig-profile"><?php esc_html_e( 'Email signature profile', 'imagina-signatures' ); ?></h2>
		<p class="description"><?php esc_html_e( 'These details fill the matching fields of your email signatures ({{job_title}}, {{phone}}, …).', 'imagina-signatures' ); ?></p>
		<?php wp_nonce_field( self::NONCE_ACTION . $user_id, self::NONCE_FIELD ); ?>
		<table class="form-table" role="presentation">
			<?php foreach ( ProfileFields::definitions() as $field ) : ?>
				<?php
				$id       = 'imgsig-profile-' . $field['key'];
				$readonly = ProfileFields::SOURCE_PLUGIN !== $field['source'];
				?>
				<tr>
					<th scope="row"><label for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $field['label'] ); ?></label></th>
					<td>
						<input
							type="<?php echo esc_attr( self::input_type( $field['type'] ) ); ?>"
							id="<?php echo esc_attr( $id ); ?>"
							class="regular-text"
							name="<?php echo esc_attr( self::FORM_KEY . '[' . $field['key'] . ']' ); ?>"
							value="<?php echo esc_attr( $values[ $field['key'] ] ?? '' ); ?>"
							<?php disabled( $readonly ); ?>
						/>
						<?php if ( $readonly ) : ?>
							<p class="description">
								<?php
								/* translators: %s: user meta key the field is read from. */
								echo esc_html( sprintf( __( 'Synced from “%s” — edit it where that data is managed.', 'imagina-signatures' ), $field['meta_key'] ) );
								?>
							</p>
						<?php endif; ?>
					</td>
				</tr>
			<?php endforeach; ?>
			<?php if ( ! empty( $groups ) && ( $manage || ! empty( $member ) ) ) : ?>
				<tr>
					<th scope="row"><?php esc_html_e( 'Signature groups', 'imagina-signatures' ); ?></th>
					<td>
						<?php if ( $manage ) : ?>
							<input type="hidden" name="<?php echo esc_attr( self::GROUPS_FLAG ); ?>" value="1" />
							<fieldset>
								<?php foreach ( $groups as $group ) : ?>
									<label style="display:block;margin-bottom:4px;">
										<input type="checkbox" name="<?php echo esc_attr( self::GROUPS_KEY ); ?>[]" value="<?php echo esc_attr( (string) $group['id'] ); ?>" <?php checked( in_array( (int) $group['id'], $member, true ) ); ?> />
										<?php echo esc_html( (string) $group['name'] ); ?>
									</label>
								<?php endforeach; ?>
							</fieldset>
						<?php else : ?>
							<?php
							$names = [];
							foreach ( $groups as $group ) {
								if ( in_array( (int) $group['id'], $member, true ) ) {
									$names[] = (string) $group['name'];
								}
							}
							echo esc_html( implode( ', ', $names ) );
							?>
						<?php endif; ?>
					</td>
				</tr>
			<?php endif; ?>
		</table>
		<?php
	}

	/**
	 * Saves the section (`personal_options_update` / `edit_user_profile_update`).
	 *
	 * @since 1.3.0
	 *
	 * @param int|string $user_id Profile owner.
	 *
	 * @return void
	 */
	public static function save( $user_id ): void {
		$user_id = (int) $user_id;
		if ( ! self::can_edit( $user_id ) || ! isset( $_POST[ self::NONCE_FIELD ] ) ) {
			return;
		}
		$nonce = sanitize_text_field( wp_unslash( $_POST[ self::NONCE_FIELD ] ) );
		if ( ! wp_verify_nonce( $nonce, self::NONCE_ACTION . $user_id ) ) {
			return;
		}

		// Each value is sanitised for its field type by ProfileFields::save().
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$raw    = isset( $_POST[ self::FORM_KEY ] ) && is_array( $_POST[ self::FORM_KEY ] ) ? wp_unslash( $_POST[ self::FORM_KEY ] ) : [];
		$values = [];
		foreach ( ProfileFields::definitions() as $field ) {
			if ( ProfileFields::SOURCE_PLUGIN === $field['source'] ) {
				$values[ $field['key'] ] = isset( $raw[ $field['key'] ] ) && is_scalar( $raw[ $field['key'] ] ) ? (string) $raw[ $field['key'] ] : '';
			}
		}
		ProfileFields::save( $user_id, $values, 'profile_screen' );

		if ( isset( $_POST[ self::GROUPS_FLAG ] ) && current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEAM ) ) {
			$ids = isset( $_POST[ self::GROUPS_KEY ] ) && is_array( $_POST[ self::GROUPS_KEY ] )
				? array_map( 'absint', wp_unslash( $_POST[ self::GROUPS_KEY ] ) )
				: [];
			Groups::set_user_groups( $user_id, $ids );
		}
	}

	/**
	 * HTML input type for a field type.
	 *
	 * @param string $type Field type.
	 *
	 * @return string
	 */
	private static function input_type( string $type ): string {
		switch ( $type ) {
			case ProfileFields::TYPE_URL:
				return 'url';
			case ProfileFields::TYPE_EMAIL:
				return 'email';
			case ProfileFields::TYPE_PHONE:
				return 'tel';
			default:
				return 'text';
		}
	}
}
